import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

import boto3
import snowflake.connector
from dotenv import load_dotenv

try:
    from airflow import DAG
    from airflow.operators.python import PythonOperator
except ImportError:
    DAG = None
    PythonOperator = None

# ------------------------------------------------------
# LOAD ENVIRONMENT VARIABLES
# ------------------------------------------------------

# Support container path with fallback to workspace paths for testing/development
_env_candidates = [
    Path("/opt/airflow/dags/.env"),
    Path(__file__).resolve().parent / ".env",
    Path("docker/dags/.env"),
    Path(".env"),
]
for _candidate in _env_candidates:
    if _candidate.is_file():
        load_dotenv(str(_candidate), override=True)
        break

logger = logging.getLogger("airflow.task")

# ------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
MINIO_BUCKET = os.getenv("MINIO_BUCKET")
MINIO_PREFIX = os.getenv("MINIO_PREFIX", "")

SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USER")
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT")
SNOWFLAKE_PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE")
SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE")
SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA")
SNOWFLAKE_TABLE = os.getenv("SNOWFLAKE_TABLE")
SNOWFLAKE_MANIFEST_TABLE = os.getenv(
    "SNOWFLAKE_MANIFEST_TABLE", "BRONZE_FILE_MANIFEST"
)

LOCAL_TEMP_PATH = os.getenv(
    "LOCAL_TEMP_PATH", "/tmp/spotify_raw.json"
)

BRONZE_COLUMNS = [
    "EVENT_ID",
    "USER_ID",
    "SONG_ID",
    "ARTIST_NAME",
    "SONG_NAME",
    "EVENT_TYPE",
    "DEVICE_TYPE",
    "COUNTRY",
    "TIMESTAMP",
]


def validate_config():
    required = {
        "MINIO_ENDPOINT": MINIO_ENDPOINT,
        "MINIO_ACCESS_KEY": MINIO_ACCESS_KEY,
        "MINIO_SECRET_KEY": MINIO_SECRET_KEY,
        "MINIO_BUCKET": MINIO_BUCKET,
        "SNOWFLAKE_USER": SNOWFLAKE_USER,
        "SNOWFLAKE_ACCOUNT": SNOWFLAKE_ACCOUNT,
        "SNOWFLAKE_PRIVATE_KEY_PATH": SNOWFLAKE_PRIVATE_KEY_PATH,
        "SNOWFLAKE_WAREHOUSE": SNOWFLAKE_WAREHOUSE,
        "SNOWFLAKE_DATABASE": SNOWFLAKE_DATABASE,
        "SNOWFLAKE_SCHEMA": SNOWFLAKE_SCHEMA,
        "SNOWFLAKE_TABLE": SNOWFLAKE_TABLE,
    }

    missing = [key for key, value in required.items() if not value]
    if missing:
        raise ValueError(
            f"Missing required environment variables: {', '.join(missing)}"
        )


def _resolve_private_key_path() -> Path:
    key_path = Path(SNOWFLAKE_PRIVATE_KEY_PATH) if SNOWFLAKE_PRIVATE_KEY_PATH else Path()
    if key_path.is_file():
        return key_path

    # Fallback to local workspace secrets when running outside container
    fallback_candidates = [
        Path("secrets/rsa_key.p8"),
        Path(__file__).resolve().parents[2] / "secrets" / "rsa_key.p8",
    ]
    for candidate in fallback_candidates:
        if candidate.is_file():
            return candidate

    raise FileNotFoundError(
        f"Snowflake private key not found at {key_path} or fallback paths."
    )


def get_snowflake_connection():
    validate_config()
    key_path = _resolve_private_key_path()

    return snowflake.connector.connect(
        user=SNOWFLAKE_USER,
        account=SNOWFLAKE_ACCOUNT,
        private_key_file=str(key_path),
        warehouse=SNOWFLAKE_WAREHOUSE,
        database=SNOWFLAKE_DATABASE,
        schema=SNOWFLAKE_SCHEMA,
        login_timeout=30,
    )


def _get_s3_client():
    endpoint = MINIO_ENDPOINT
    # Fallback to localhost if container host is unreachable during host test execution
    if "minio:" in endpoint and not Path("/.dockerenv").exists():
        endpoint = "http://localhost:9002"

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
    )


def ensure_snowflake_tables(conn):
    """Ensure Bronze table and Manifest table exist idempotently."""
    bronze_target = (
        f'"{SNOWFLAKE_DATABASE}"."{SNOWFLAKE_SCHEMA}"."{SNOWFLAKE_TABLE}"'
    )
    manifest_target = (
        f'"{SNOWFLAKE_DATABASE}"."{SNOWFLAKE_SCHEMA}"."{SNOWFLAKE_MANIFEST_TABLE}"'
    )

    with conn.cursor() as cur:
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {bronze_target} (
                event_id STRING,
                user_id STRING,
                song_id STRING,
                artist_name STRING,
                song_name STRING,
                event_type STRING,
                device_type STRING,
                country STRING,
                timestamp STRING
            )
        """)

        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {manifest_target} (
                MANIFEST_ID VARCHAR(64) NOT NULL,
                SOURCE_FILE VARCHAR(1024) NOT NULL,
                SOURCE_ETAG VARCHAR(256),
                SOURCE_SIZE NUMBER(38, 0),
                SOURCE_LAST_MODIFIED TIMESTAMP_TZ,
                STATUS VARCHAR(32) NOT NULL,
                BATCH_ID VARCHAR(64) NOT NULL,
                RECORD_COUNT NUMBER(38, 0),
                STARTED_AT TIMESTAMP_TZ NOT NULL,
                COMPLETED_AT TIMESTAMP_TZ,
                ERROR_MESSAGE VARCHAR(4000),
                CREATED_AT TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
                CONSTRAINT PK_BRONZE_FILE_MANIFEST PRIMARY KEY (MANIFEST_ID)
            )
        """)
    conn.commit()


def get_successful_manifest_files(conn) -> Dict[str, Set[Tuple[str, int]]]:
    """
    Returns a mapping of SOURCE_FILE -> set of (SOURCE_ETAG, SOURCE_SIZE)
    that have been successfully processed.
    """
    manifest_target = (
        f'"{SNOWFLAKE_DATABASE}"."{SNOWFLAKE_SCHEMA}"."{SNOWFLAKE_MANIFEST_TABLE}"'
    )
    successful_map: Dict[str, Set[Tuple[str, int]]] = {}

    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT SOURCE_FILE, COALESCE(SOURCE_ETAG, ''), COALESCE(SOURCE_SIZE, 0)
            FROM {manifest_target}
            WHERE STATUS = 'SUCCESS'
        """)
        for file_key, etag, size in cur.fetchall():
            cleaned_etag = str(etag).strip('"')
            successful_map.setdefault(file_key, set()).add((cleaned_etag, int(size)))

    return successful_map


def sanitize_error(err_str: str) -> str:
    """Safely truncate and mask sensitive details in error messages."""
    clean = str(err_str)[:3900]
    if MINIO_SECRET_KEY:
        clean = clean.replace(MINIO_SECRET_KEY, "***")
    if MINIO_ACCESS_KEY:
        clean = clean.replace(MINIO_ACCESS_KEY, "***")
    return clean


# ------------------------------------------------------
# EXTRACT FROM MINIO (FILE-AWARE)
# ------------------------------------------------------


def extract_from_minio(**context) -> str:
    validate_config()
    run_id = (
        context.get("run_id")
        if context and "run_id" in context
        else f"batch_{uuid.uuid4().hex[:12]}"
    )

    conn = get_snowflake_connection()
    try:
        ensure_snowflake_tables(conn)
        successful_manifest = get_successful_manifest_files(conn)
    finally:
        conn.close()

    s3 = _get_s3_client()
    paginator = s3.get_paginator("list_objects_v2")

    candidate_files: List[Dict[str, Any]] = []
    skipped_count = 0

    for page in paginator.paginate(Bucket=MINIO_BUCKET, Prefix=MINIO_PREFIX):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".json"):
                continue

            etag = obj.get("ETag", "").strip('"')
            size = int(obj.get("Size", 0))
            last_modified = (
                obj["LastModified"].isoformat()
                if "LastModified" in obj and obj["LastModified"]
                else None
            )

            # Check if this exact file identity was already successfully processed
            known_versions = successful_manifest.get(key, set())
            if (etag, size) in known_versions:
                skipped_count += 1
                continue

            # Candidate file: either new, modified, or previous attempt failed/interrupted
            file_entry: Dict[str, Any] = {
                "source_file": key,
                "source_etag": etag,
                "source_size": size,
                "source_last_modified": last_modified,
                "records": [],
                "parse_error": None,
            }

            try:
                response = s3.get_object(Bucket=MINIO_BUCKET, Key=key)
                with response["Body"] as body:
                    lines = body.read().decode("utf-8").splitlines()

                records = []
                for idx, line in enumerate(lines, start=1):
                    trimmed = line.strip()
                    if not trimmed:
                        continue
                    try:
                        records.append(json.loads(trimmed))
                    except json.JSONDecodeError as jde:
                        file_entry["parse_error"] = (
                            f"Invalid JSON at line {idx}: {str(jde)[:200]}"
                        )
                        break

                if not file_entry["parse_error"]:
                    file_entry["records"] = records

            except Exception as read_err:
                file_entry["parse_error"] = (
                    f"MinIO read error: {sanitize_error(str(read_err))}"
                )

            candidate_files.append(file_entry)

    payload = {
        "batch_id": run_id,
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "total_candidates": len(candidate_files),
        "skipped_unchanged": skipped_count,
        "files": candidate_files,
    }

    temp_path = Path(LOCAL_TEMP_PATH)
    temp_path.parent.mkdir(parents=True, exist_ok=True)
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    print(
        f"Extraction complete: {len(candidate_files)} candidate files queued, "
        f"{skipped_count} unchanged files skipped (Batch: {run_id})."
    )

    return str(temp_path)


# ------------------------------------------------------
# LOAD INTO SNOWFLAKE BRONZE (TRANSACTIONAL & AUDITED)
# ------------------------------------------------------


def load_raw_to_snowflake(**context):
    file_path = None
    if context and "ti" in context:
        file_path = context["ti"].xcom_pull(task_ids="extract_data")
    if not file_path:
        file_path = LOCAL_TEMP_PATH

    path_obj = Path(file_path)
    if not path_obj.is_file():
        print(f"No extraction payload found at {file_path}. Exiting.")
        return

    with open(path_obj, "r", encoding="utf-8") as f:
        payload = json.load(f)

    batch_id = payload.get("batch_id", f"batch_{uuid.uuid4().hex[:12]}")
    files: List[Dict[str, Any]] = payload.get("files", [])

    if not files:
        print("No new or modified files to load.")
        return

    conn = get_snowflake_connection()
    bronze_target = (
        f'"{SNOWFLAKE_DATABASE}"."{SNOWFLAKE_SCHEMA}"."{SNOWFLAKE_TABLE}"'
    )
    manifest_target = (
        f'"{SNOWFLAKE_DATABASE}"."{SNOWFLAKE_SCHEMA}"."{SNOWFLAKE_MANIFEST_TABLE}"'
    )

    columns = BRONZE_COLUMNS
    column_sql = ", ".join(f'"{col}"' for col in columns)
    placeholders = ", ".join(["%s"] * len(columns))

    success_count = 0
    failure_count = 0

    try:
        ensure_snowflake_tables(conn)

        for item in files:
            source_file = item["source_file"]
            source_etag = item.get("source_etag")
            source_size = item.get("source_size")
            source_last_modified = item.get("source_last_modified")
            records = item.get("records", [])
            parse_error = item.get("parse_error")
            manifest_id = str(uuid.uuid4())

            # Step 1: Record PROCESSING state in manifest
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {manifest_target} (
                        MANIFEST_ID, SOURCE_FILE, SOURCE_ETAG, SOURCE_SIZE,
                        SOURCE_LAST_MODIFIED, STATUS, BATCH_ID, STARTED_AT
                    ) VALUES (
                        %s, %s, %s, %s, %s, 'PROCESSING', %s, CURRENT_TIMESTAMP()
                    )
                    """,
                    (
                        manifest_id,
                        source_file,
                        source_etag,
                        source_size,
                        source_last_modified,
                        batch_id,
                    ),
                )
            conn.commit()

            # Step 2: Handle parse/read validation failures
            if parse_error:
                safe_err = sanitize_error(parse_error)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        UPDATE {manifest_target}
                        SET STATUS = 'FAILED',
                            RECORD_COUNT = 0,
                            ERROR_MESSAGE = %s,
                            COMPLETED_AT = CURRENT_TIMESTAMP()
                        WHERE MANIFEST_ID = %s
                        """,
                        (safe_err, manifest_id),
                    )
                conn.commit()
                failure_count += 1
                print(f"File {source_file} marked FAILED: {safe_err}")
                continue

            # Step 3: Insert raw records and mark SUCCESS in atomic transaction
            # Do NOT deduplicate records by EVENT_ID; preserve all valid source events.
            rows = [
                tuple(
                    event.get(col.lower())
                    if event.get(col.lower()) is not None
                    else event.get(col)
                    for col in columns
                )
                for event in records
            ]

            try:
                with conn.cursor() as cur:
                    cur.execute("BEGIN TRANSACTION")

                    if rows:
                        cur.executemany(
                            f"""
                            INSERT INTO {bronze_target} ({column_sql})
                            VALUES ({placeholders})
                            """,
                            rows,
                        )

                    cur.execute(
                        f"""
                        UPDATE {manifest_target}
                        SET STATUS = 'SUCCESS',
                            RECORD_COUNT = %s,
                            COMPLETED_AT = CURRENT_TIMESTAMP()
                        WHERE MANIFEST_ID = %s
                        """,
                        (len(rows), manifest_id),
                    )
                    cur.execute("COMMIT")

                conn.commit()
                success_count += 1
                print(
                    f"Successfully ingested {source_file}: {len(rows)} records "
                    f"(Manifest ID: {manifest_id})."
                )

            except Exception as load_err:
                try:
                    with conn.cursor() as cur:
                        cur.execute("ROLLBACK")
                except Exception:
                    pass

                safe_err = sanitize_error(f"Bronze insert error: {load_err}")
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        UPDATE {manifest_target}
                        SET STATUS = 'FAILED',
                            RECORD_COUNT = 0,
                            ERROR_MESSAGE = %s,
                            COMPLETED_AT = CURRENT_TIMESTAMP()
                        WHERE MANIFEST_ID = %s
                        """,
                        (safe_err, manifest_id),
                    )
                conn.commit()
                failure_count += 1
                print(f"Failed to ingest {source_file}: {safe_err}")

        print(
            f"Batch {batch_id} finished: {success_count} succeeded, "
            f"{failure_count} failed."
        )

    finally:
        conn.close()


# ------------------------------------------------------
# DAG DEFINITION
# ------------------------------------------------------

default_args = {
    "owner": "airflow",
    "start_date": datetime(2025, 10, 21),
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

dag = None
if DAG is not None:
    with DAG(
        dag_id="spotify_minio_to_snowflake_bronze",
        default_args=default_args,
        description="Load raw Spotify events from MinIO to Snowflake Bronze with file-level manifest tracking",
        schedule="@hourly",
        catchup=False,
        max_active_runs=1,
    ) as dag:

        extract_task = PythonOperator(
            task_id="extract_data",
            python_callable=extract_from_minio,
        )

        load_task = PythonOperator(
            task_id="load_raw_to_snowflake",
            python_callable=load_raw_to_snowflake,
        )

        extract_task >> load_task
