import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import boto3
import pytest
from dotenv import load_dotenv

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root / "docker" / "dags"))

env_file = project_root / "docker" / "dags" / ".env"
if env_file.is_file():
    load_dotenv(str(env_file), override=True)

from minio_to_snowflake import (
    extract_from_minio,
    get_snowflake_connection,
    get_successful_manifest_files,
    load_raw_to_snowflake,
)


pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def s3_client():
    return boto3.client(
        "s3",
        endpoint_url="http://localhost:9002",
        aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"),
    )


@pytest.fixture(scope="module")
def sf_conn():
    conn = get_snowflake_connection()
    yield conn
    conn.close()


def test_e2e_new_file_and_subsequent_skip(s3_client, sf_conn):
    bucket = os.getenv("MINIO_BUCKET")
    db = os.getenv("SNOWFLAKE_DATABASE")
    schema = os.getenv("SNOWFLAKE_SCHEMA")
    table = os.getenv("SNOWFLAKE_TABLE")
    manifest = os.getenv("SNOWFLAKE_MANIFEST_TABLE", "BRONZE_FILE_MANIFEST")

    test_id = uuid.uuid4().hex[:8]
    test_key = f"bronze/date=2026-10-25/hour=12/spotify_events_test_{test_id}.json"
    event_1 = {
        "event_id": f"e2e_evt1_{test_id}",
        "user_id": "u1",
        "song_id": "s1",
        "artist_name": "Artist1",
        "song_name": "Song1",
        "event_type": "play",
        "device_type": "desktop",
        "country": "US",
        "timestamp": "2026-10-25T12:00:00Z",
    }
    event_2 = {
        "event_id": f"e2e_evt2_{test_id}",
        "user_id": "u2",
        "song_id": "s2",
        "artist_name": "Artist2",
        "song_name": "Song2",
        "event_type": "skip",
        "device_type": "mobile",
        "country": "UK",
        "timestamp": "2026-10-25T12:05:00Z",
    }
    body = f"{json.dumps(event_1)}\n{json.dumps(event_2)}\n"

    s3_client.put_object(Bucket=bucket, Key=test_key, Body=body.encode("utf-8"))

    try:
        payload_path = extract_from_minio()
        with open(payload_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        queued_keys = [item["source_file"] for item in data["files"]]
        assert test_key in queued_keys, "New file must be queued for ingestion"

        load_raw_to_snowflake()

        with sf_conn.cursor() as cur:
            cur.execute(
                f'SELECT STATUS, RECORD_COUNT FROM "{db}"."{schema}"."{manifest}" WHERE SOURCE_FILE = %s',
                (test_key,),
            )
            row = cur.fetchone()
            assert row is not None, "Manifest row must exist"
            assert row[0] == "SUCCESS", f"Expected SUCCESS status, got {row[0]}"
            assert row[1] == 2, f"Expected 2 records, got {row[1]}"

            cur.execute(
                f'SELECT COUNT(*) FROM "{db}"."{schema}"."{table}" WHERE EVENT_ID IN (%s, %s)',
                (event_1["event_id"], event_2["event_id"]),
            )
            count = cur.fetchone()[0]
            assert count == 2, f"Expected 2 Bronze rows, found {count}"

        payload_path_2 = extract_from_minio()
        with open(payload_path_2, "r", encoding="utf-8") as f:
            data_2 = json.load(f)

        queued_keys_2 = [item["source_file"] for item in data_2["files"]]
        assert test_key not in queued_keys_2, "Already processed file must NOT be queued again"

    finally:
        s3_client.delete_object(Bucket=bucket, Key=test_key)
        with sf_conn.cursor() as cur:
            cur.execute(
                f'DELETE FROM "{db}"."{schema}"."{table}" WHERE EVENT_ID IN (%s, %s)',
                (event_1["event_id"], event_2["event_id"]),
            )
            cur.execute(
                f'DELETE FROM "{db}"."{schema}"."{manifest}" WHERE SOURCE_FILE = %s',
                (test_key,),
            )
        sf_conn.commit()


def test_e2e_corrupted_json_marked_failed(s3_client, sf_conn):
    bucket = os.getenv("MINIO_BUCKET")
    db = os.getenv("SNOWFLAKE_DATABASE")
    schema = os.getenv("SNOWFLAKE_SCHEMA")
    table = os.getenv("SNOWFLAKE_TABLE")
    manifest = os.getenv("SNOWFLAKE_MANIFEST_TABLE", "BRONZE_FILE_MANIFEST")

    test_id = uuid.uuid4().hex[:8]
    test_key = f"bronze/date=2026-10-25/hour=12/spotify_events_corrupt_{test_id}.json"
    corrupt_body = '{"event_id": "ok"}\n{THIS IS NOT VALID JSON}\n'

    s3_client.put_object(Bucket=bucket, Key=test_key, Body=corrupt_body.encode("utf-8"))

    try:
        extract_from_minio()
        load_raw_to_snowflake()

        with sf_conn.cursor() as cur:
            cur.execute(
                f'SELECT STATUS, RECORD_COUNT, ERROR_MESSAGE FROM "{db}"."{schema}"."{manifest}" WHERE SOURCE_FILE = %s',
                (test_key,),
            )
            row = cur.fetchone()
            assert row is not None, "Manifest row must be recorded"
            assert row[0] == "FAILED", f"Expected status FAILED, got {row[0]}"
            assert row[1] == 0, f"Expected 0 record count on failure, got {row[1]}"
            assert "Invalid JSON" in row[2], f"Expected JSON error in error message, got {row[2]}"

    finally:
        s3_client.delete_object(Bucket=bucket, Key=test_key)
        with sf_conn.cursor() as cur:
            cur.execute(
                f'DELETE FROM "{db}"."{schema}"."{manifest}" WHERE SOURCE_FILE = %s',
                (test_key,),
            )
        sf_conn.commit()
