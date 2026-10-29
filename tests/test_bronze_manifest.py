import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import snowflake.connector
from dotenv import load_dotenv

import sys

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root / "docker" / "dags"))

env_file = project_root / "docker" / "dags" / ".env"
if env_file.is_file():
    load_dotenv(str(env_file), override=True)

from minio_to_snowflake import (
    BRONZE_COLUMNS,
    ensure_snowflake_tables,
    get_snowflake_connection,
    get_successful_manifest_files,
    sanitize_error,
)


@pytest.fixture(scope="module")
def sf_conn():
    conn = get_snowflake_connection()
    ensure_snowflake_tables(conn)
    yield conn
    conn.close()


@pytest.mark.integration
def test_bronze_table_data_preserved(sf_conn):
    db = os.getenv("SNOWFLAKE_DATABASE")
    schema = os.getenv("SNOWFLAKE_SCHEMA")
    table = os.getenv("SNOWFLAKE_TABLE")

    with sf_conn.cursor() as cur:
        cur.execute(f'SELECT COUNT(*), COUNT(DISTINCT EVENT_ID) FROM "{db}"."{schema}"."{table}"')
        total_rows, distinct_events = cur.fetchone()

    # Bronze is append-only and keeps redelivered events, so it holds at least one row per distinct event.
    assert distinct_events > 0, "Bronze is empty"
    assert total_rows >= distinct_events, f"{total_rows} rows cannot hold {distinct_events} distinct events"


@pytest.mark.integration
def test_manifest_table_structure_and_idempotency(sf_conn):
    db = os.getenv("SNOWFLAKE_DATABASE")
    schema = os.getenv("SNOWFLAKE_SCHEMA")
    manifest = os.getenv("SNOWFLAKE_MANIFEST_TABLE", "BRONZE_FILE_MANIFEST")

    ensure_snowflake_tables(sf_conn)

    with sf_conn.cursor() as cur:
        cur.execute(f'DESC TABLE "{db}"."{schema}"."{manifest}"')
        cols = {row[0].upper(): row[1] for row in cur.fetchall()}

    expected_cols = [
        "MANIFEST_ID",
        "SOURCE_FILE",
        "SOURCE_ETAG",
        "SOURCE_SIZE",
        "SOURCE_LAST_MODIFIED",
        "STATUS",
        "BATCH_ID",
        "RECORD_COUNT",
        "STARTED_AT",
        "COMPLETED_AT",
        "ERROR_MESSAGE",
        "CREATED_AT",
    ]

    for col in expected_cols:
        assert col in cols, f"Column {col} missing from manifest table"


@pytest.mark.integration
def test_unchanged_file_recognition(sf_conn):
    db = os.getenv("SNOWFLAKE_DATABASE")
    schema = os.getenv("SNOWFLAKE_SCHEMA")
    manifest = os.getenv("SNOWFLAKE_MANIFEST_TABLE", "BRONZE_FILE_MANIFEST")

    test_file = f"test/unit_unchanged_{uuid.uuid4().hex[:8]}.json"
    test_etag = "etag_abc123"
    test_size = 3200
    manifest_id = str(uuid.uuid4())

    with sf_conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO "{db}"."{schema}"."{manifest}" (
                MANIFEST_ID, SOURCE_FILE, SOURCE_ETAG, SOURCE_SIZE,
                STATUS, BATCH_ID, RECORD_COUNT, STARTED_AT, COMPLETED_AT
            ) VALUES (%s, %s, %s, %s, 'SUCCESS', 'batch_test', 10, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
            """,
            (manifest_id, test_file, test_etag, test_size),
        )
    sf_conn.commit()

    success_map = get_successful_manifest_files(sf_conn)
    assert test_file in success_map, "Test file should be in success map"
    assert (test_etag, test_size) in success_map[test_file], "Matching (etag, size) should be recognized"

    with sf_conn.cursor() as cur:
        cur.execute(f'DELETE FROM "{db}"."{schema}"."{manifest}" WHERE MANIFEST_ID = %s', (manifest_id,))
    sf_conn.commit()


@pytest.mark.integration
def test_changed_file_detection(sf_conn):
    db = os.getenv("SNOWFLAKE_DATABASE")
    schema = os.getenv("SNOWFLAKE_SCHEMA")
    manifest = os.getenv("SNOWFLAKE_MANIFEST_TABLE", "BRONZE_FILE_MANIFEST")

    test_file = f"test/unit_changed_{uuid.uuid4().hex[:8]}.json"
    v1_etag = "v1_etag"
    v1_size = 1000
    manifest_id = str(uuid.uuid4())

    with sf_conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO "{db}"."{schema}"."{manifest}" (
                MANIFEST_ID, SOURCE_FILE, SOURCE_ETAG, SOURCE_SIZE,
                STATUS, BATCH_ID, RECORD_COUNT, STARTED_AT, COMPLETED_AT
            ) VALUES (%s, %s, %s, %s, 'SUCCESS', 'batch_test_v1', 5, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
            """,
            (manifest_id, test_file, v1_etag, v1_size),
        )
    sf_conn.commit()

    success_map = get_successful_manifest_files(sf_conn)

    assert (v1_etag, v1_size) in success_map.get(test_file, set())

    v2_etag = "v2_etag_modified"
    v2_size = 2500
    assert (v2_etag, v2_size) not in success_map.get(test_file, set()), "Changed version should not match"

    with sf_conn.cursor() as cur:
        cur.execute(f'DELETE FROM "{db}"."{schema}"."{manifest}" WHERE MANIFEST_ID = %s', (manifest_id,))
    sf_conn.commit()


@pytest.mark.integration
def test_failed_and_interrupted_attempts_are_recoverable(sf_conn):
    db = os.getenv("SNOWFLAKE_DATABASE")
    schema = os.getenv("SNOWFLAKE_SCHEMA")
    manifest = os.getenv("SNOWFLAKE_MANIFEST_TABLE", "BRONZE_FILE_MANIFEST")

    test_file = f"test/unit_failed_{uuid.uuid4().hex[:8]}.json"
    manifest_id_fail = str(uuid.uuid4())
    manifest_id_proc = str(uuid.uuid4())

    with sf_conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO "{db}"."{schema}"."{manifest}" (
                MANIFEST_ID, SOURCE_FILE, SOURCE_ETAG, SOURCE_SIZE,
                STATUS, BATCH_ID, STARTED_AT, ERROR_MESSAGE
            ) VALUES (%s, %s, 'etag_fail', 500, 'FAILED', 'batch_fail', CURRENT_TIMESTAMP(), 'Invalid JSON error')
            """,
            (manifest_id_fail, test_file),
        )
        cur.execute(
            f"""
            INSERT INTO "{db}"."{schema}"."{manifest}" (
                MANIFEST_ID, SOURCE_FILE, SOURCE_ETAG, SOURCE_SIZE,
                STATUS, BATCH_ID, STARTED_AT
            ) VALUES (%s, %s, 'etag_proc', 600, 'PROCESSING', 'batch_proc', CURRENT_TIMESTAMP())
            """,
            (manifest_id_proc, test_file),
        )
    sf_conn.commit()

    success_map = get_successful_manifest_files(sf_conn)
    assert test_file not in success_map, "FAILED and PROCESSING files must never appear in success_map"

    with sf_conn.cursor() as cur:
        cur.execute(
            f'DELETE FROM "{db}"."{schema}"."{manifest}" WHERE MANIFEST_ID IN (%s, %s)',
            (manifest_id_fail, manifest_id_proc),
        )
    sf_conn.commit()


def test_error_sanitization(monkeypatch):
    import minio_to_snowflake

    monkeypatch.setattr(minio_to_snowflake, "MINIO_SECRET_KEY", "test-secret-value")
    monkeypatch.setattr(minio_to_snowflake, "MINIO_ACCESS_KEY", "test-access-value")
    raw_error = "Auth failure for test-access-value with secret test-secret-value while connecting to s3."
    sanitized = sanitize_error(raw_error)

    assert "test-secret-value" not in sanitized, "Secret key must be masked in sanitized error"
    assert "test-access-value" not in sanitized, "Access key must be masked in sanitized error"
    assert "***" in sanitized, "Mask placeholder must be present"


@pytest.mark.integration
def test_duplicate_event_ids_not_discarded(sf_conn):
    db = os.getenv("SNOWFLAKE_DATABASE")
    schema = os.getenv("SNOWFLAKE_SCHEMA")
    table = os.getenv("SNOWFLAKE_TABLE")

    duplicate_event_id = f"test_dup_{uuid.uuid4().hex[:8]}"
    test_rows = [
        (duplicate_event_id, "user_1", "song_1", "Artist", "Song", "play", "mobile", "US", "2026-10-25T12:00:00Z"),
        (duplicate_event_id, "user_1", "song_1", "Artist", "Song", "play", "mobile", "US", "2026-10-25T12:01:00Z"),
    ]

    columns = BRONZE_COLUMNS
    column_sql = ", ".join(f'"{col}"' for col in columns)
    placeholders = ", ".join(["%s"] * len(columns))

    with sf_conn.cursor() as cur:
        cur.executemany(
            f'INSERT INTO "{db}"."{schema}"."{table}" ({column_sql}) VALUES ({placeholders})',
            test_rows,
        )
    sf_conn.commit()

    with sf_conn.cursor() as cur:
        cur.execute(
            f'SELECT COUNT(*) FROM "{db}"."{schema}"."{table}" WHERE EVENT_ID = %s',
            (duplicate_event_id,),
        )
        count = cur.fetchone()[0]

    assert count == 2, f"Bronze must preserve duplicate event_ids, expected 2 but found {count}"

    with sf_conn.cursor() as cur:
        cur.execute(
            f'DELETE FROM "{db}"."{schema}"."{table}" WHERE EVENT_ID = %s',
            (duplicate_event_id,),
        )
    sf_conn.commit()


def test_airflow_dag_configuration():
    try:
        from airflow.models import DagBag
        dagbag = DagBag(dag_folder="docker/dags", include_examples=False)
        assert not dagbag.import_errors, f"DAG import errors: {dagbag.import_errors}"
        dag = dagbag.get_dag("spotify_minio_to_snowflake_bronze")
        assert dag is not None, "DAG spotify_minio_to_snowflake_bronze not found"
        assert dag.max_active_runs == 1, "DAG must enforce max_active_runs=1 for concurrency safety"
        assert "extract_data" in dag.task_dict
        assert "load_raw_to_snowflake" in dag.task_dict
    except ImportError:
        dag_content = (project_root / "docker" / "dags" / "minio_to_snowflake.py").read_text(encoding="utf-8")
        assert 'dag_id="spotify_minio_to_snowflake_bronze"' in dag_content
        assert "max_active_runs=1" in dag_content
        assert 'task_id="extract_data"' in dag_content
        assert 'task_id="load_raw_to_snowflake"' in dag_content

