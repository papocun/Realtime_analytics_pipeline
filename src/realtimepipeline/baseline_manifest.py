"""One-off backfill: registers MinIO files loaded before the manifest existed, so the DAG does not ingest them twice."""

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
import boto3
import snowflake.connector
from dotenv import load_dotenv

for env_path in [
    Path("docker/dags/.env"),
    Path(__file__).resolve().parents[2] / "docker" / "dags" / ".env",
    Path(".env"),
]:
    if env_path.is_file():
        load_dotenv(str(env_path), override=True)
        break


def get_snowflake_conn():
    user = os.getenv("SNOWFLAKE_USER")
    account = os.getenv("SNOWFLAKE_ACCOUNT")
    warehouse = os.getenv("SNOWFLAKE_WAREHOUSE")
    database = os.getenv("SNOWFLAKE_DATABASE")
    schema = os.getenv("SNOWFLAKE_SCHEMA")

    key_path = Path("secrets/rsa_key.p8")
    if not key_path.is_file():
        key_path = Path(os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH", "secrets/rsa_key.p8"))

    return snowflake.connector.connect(
        user=user,
        account=account,
        private_key_file=str(key_path),
        warehouse=warehouse,
        database=database,
        schema=schema,
    )


def baseline_existing_files():
    conn = get_snowflake_conn()
    s3_endpoint = os.getenv("MINIO_HOST_ENDPOINT", "http://localhost:9002")
    bucket = os.getenv("MINIO_BUCKET", "spotify")
    prefix = os.getenv("MINIO_PREFIX", "bronze/date=")

    s3 = boto3.client(
        "s3",
        endpoint_url=s3_endpoint,
        aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"),
    )

    manifest_target = f'"{os.getenv("SNOWFLAKE_DATABASE")}"."{os.getenv("SNOWFLAKE_SCHEMA")}"."{os.getenv("SNOWFLAKE_MANIFEST_TABLE", "BRONZE_FILE_MANIFEST")}"'

    with conn.cursor() as cur:
        cur.execute(f"SELECT SOURCE_FILE FROM {manifest_target} WHERE STATUS = 'SUCCESS'")
        already_tracked = {row[0] for row in cur.fetchall()}

    paginator = s3.get_paginator("list_objects_v2")
    to_register = []

    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".json") or key in already_tracked:
                continue

            etag = obj.get("ETag", "").strip('"')
            size = obj.get("Size", 0)
            last_mod = obj.get("LastModified")

            to_register.append((
                str(uuid.uuid4()),
                key,
                etag,
                size,
                last_mod,
                "SUCCESS",
                "baseline_preexisting",
                None,
                last_mod or datetime.now(timezone.utc),
                datetime.now(timezone.utc),
            ))

    if not to_register:
        print("No un-manifested baseline files found in MinIO.")
        conn.close()
        return 0

    with conn.cursor() as cur:
        cur.executemany(
            f"""
            INSERT INTO {manifest_target} (
                MANIFEST_ID, SOURCE_FILE, SOURCE_ETAG, SOURCE_SIZE,
                SOURCE_LAST_MODIFIED, STATUS, BATCH_ID, RECORD_COUNT,
                STARTED_AT, COMPLETED_AT
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            to_register,
        )
    conn.commit()
    conn.close()
    print(f"Successfully baselined {len(to_register)} existing files into {manifest_target}.")
    return len(to_register)


if __name__ == "__main__":
    baseline_existing_files()
