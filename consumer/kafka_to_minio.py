"""Kafka -> MinIO Bronze landing: batches events into JSON Lines files and commits offsets only after a successful upload."""

import json
import logging
import os
import signal
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import boto3
from dotenv import load_dotenv
from kafka import KafkaConsumer, OffsetAndMetadata, TopicPartition

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger("kafka_to_minio")

_env_candidates = [
    os.path.join(os.path.dirname(__file__), ".env"),
    ".env",
]
for _env_path in _env_candidates:
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
load_dotenv()

MINIO_BUCKET = os.getenv("MINIO_BUCKET")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC")
KAFKA_BOOTSTRAP_SERVER = os.getenv("KAFKA_BOOTSTRAP_SERVER") or os.getenv("KAFKA_BOOTSTRAP_SERVERS")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", 10))


class GracefulShutdown(Exception):
    pass


def ensure_bucket_exists(s3_client, bucket_name: str) -> None:
    try:
        s3_client.head_bucket(Bucket=bucket_name)
        log.info("Bucket %s already exists.", bucket_name)
    except Exception:
        s3_client.create_bucket(Bucket=bucket_name)
        log.info("Created bucket %s.", bucket_name)


def build_commit_offsets(batch: List[Any]) -> Dict[TopicPartition, OffsetAndMetadata]:
    offsets: Dict[TopicPartition, OffsetAndMetadata] = {}
    for msg in batch:
        if hasattr(msg, "topic") and hasattr(msg, "partition") and hasattr(msg, "offset"):
            tp = TopicPartition(msg.topic, msg.partition)
            next_offset = msg.offset + 1
            if tp not in offsets or next_offset > offsets[tp].offset:
                offsets[tp] = OffsetAndMetadata(next_offset, "")
    return offsets


def upload_batch(
    s3_client,
    consumer,
    batch: List[Any],
    bucket_name: str,
    max_retries: int = 3,
    retry_delay: float = 1.0,
) -> Optional[str]:
    if not batch:
        return None

    now = datetime.now(timezone.utc)
    date_path = now.strftime("date=%Y-%m-%d/hour=%H")
    # Random suffix: two batches flushed in the same second must never overwrite each other's object.
    file_name = f"spotify_events_{now.strftime('%Y-%m-%dT%H-%M-%S')}_{uuid.uuid4().hex[:8]}.json"
    file_path = f"bronze/{date_path}/{file_name}"

    json_data = "\n".join([json.dumps(m.value if hasattr(m, "value") else m) for m in batch])

    uploaded = False
    last_error: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            s3_client.put_object(
                Bucket=bucket_name,
                Key=file_path,
                Body=json_data.encode("utf-8"),
            )
            uploaded = True
            break
        except Exception as e:
            last_error = e
            log.error(
                "Failed to upload batch of %d events to MinIO (%s) (attempt %d/%d): %s",
                len(batch), file_path, attempt, max_retries, e,
            )
            if attempt < max_retries and retry_delay > 0:
                time.sleep(retry_delay * attempt)

    if not uploaded:
        log.error(
            "CRITICAL: Failed to upload batch to MinIO after %d attempts. Offsets will NOT be committed.",
            max_retries,
        )
        raise RuntimeError(f"Failed to upload batch to MinIO ({file_path}): {last_error}") from last_error

    log.info("✅ Uploaded %d events to MinIO: %s", len(batch), file_path)

    # At-least-once: offsets advance only after the object is durable, so a crash replays the batch
    # instead of losing it. Any duplicates this creates are removed by event_id in Silver.
    offsets = build_commit_offsets(batch)
    if offsets and consumer:
        consumer.commit(offsets=offsets)
        log.info("Committed offsets for %d partition(s): %s", len(offsets), offsets)

    return file_path


def consume_events(
    s3_client,
    consumer,
    bucket_name: str = MINIO_BUCKET,
    batch_size: int = BATCH_SIZE,
    max_retries: int = 3,
    retry_delay: float = 1.0,
) -> None:
    batch: List[Any] = []
    shutdown_requested = False

    def _sig_handler(signum, frame):
        nonlocal shutdown_requested
        shutdown_requested = True
        log.info("Shutdown signal %s received. Preparing to flush and close...", signum)
        raise GracefulShutdown()

    try:
        signal.signal(signal.SIGINT, _sig_handler)
        signal.signal(signal.SIGTERM, _sig_handler)
    except (ValueError, AttributeError):
        pass

    log.info("🎧 Listening for events on Kafka topic '%s'...", KAFKA_TOPIC)

    upload_error = False
    try:
        for message in consumer:
            batch.append(message)

            if len(batch) >= batch_size:
                upload_batch(
                    s3_client=s3_client,
                    consumer=consumer,
                    batch=batch,
                    bucket_name=bucket_name,
                    max_retries=max_retries,
                    retry_delay=retry_delay,
                )
                batch = []

            if shutdown_requested:
                break
    except (KeyboardInterrupt, GracefulShutdown):
        log.info("Shutdown initiated. Stopping consumer loop...")
    except Exception as e:
        upload_error = True
        log.error("Consumer loop encountered fatal error: %s", e)
        raise
    finally:
        try:
            if batch and not upload_error:
                log.info("Flushing pending batch of %d event(s) before shutdown...", len(batch))
                upload_batch(
                    s3_client=s3_client,
                    consumer=consumer,
                    batch=batch,
                    bucket_name=bucket_name,
                    max_retries=max_retries,
                    retry_delay=retry_delay,
                )
                batch = []
        finally:
            try:
                consumer.close()
                log.info("Kafka consumer closed.")
            except Exception as e:
                log.warning("Error while closing consumer: %s", e)


def create_kafka_consumer(
    topic: Optional[str] = None,
    bootstrap_server: Optional[str] = None,
    group_id: Optional[str] = None,
) -> KafkaConsumer:
    topic_name = topic or os.getenv("KAFKA_TOPIC") or KAFKA_TOPIC
    bootstrap = (
        bootstrap_server
        or os.getenv("KAFKA_BOOTSTRAP_SERVER")
        or os.getenv("KAFKA_BOOTSTRAP_SERVERS")
        or KAFKA_BOOTSTRAP_SERVER
    )
    group = group_id or os.getenv("KAFKA_GROUP_ID") or KAFKA_GROUP_ID

    return KafkaConsumer(
        topic_name,
        bootstrap_servers=[bootstrap],
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        group_id=group,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )


def create_s3_client(
    endpoint_url: Optional[str] = None,
    aws_access_key_id: Optional[str] = None,
    aws_secret_access_key: Optional[str] = None,
):
    endpoint = endpoint_url or os.getenv("MINIO_ENDPOINT") or MINIO_ENDPOINT
    access_key = aws_access_key_id or os.getenv("MINIO_ACCESS_KEY") or MINIO_ACCESS_KEY
    secret_key = aws_secret_access_key or os.getenv("MINIO_SECRET_KEY") or MINIO_SECRET_KEY

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )


def main() -> None:
    missing = [
        name for name, value in {
            "MINIO_BUCKET": MINIO_BUCKET,
            "MINIO_ENDPOINT": MINIO_ENDPOINT,
            "KAFKA_TOPIC": KAFKA_TOPIC,
            "KAFKA_BOOTSTRAP_SERVER": KAFKA_BOOTSTRAP_SERVER,
            "KAFKA_GROUP_ID": KAFKA_GROUP_ID,
        }.items() if not value
    ]
    if missing:
        log.error("Missing required configuration: %s", ", ".join(missing))
        sys.exit(1)

    s3 = create_s3_client()
    ensure_bucket_exists(s3, MINIO_BUCKET)
    consumer = create_kafka_consumer()
    consume_events(
        s3_client=s3,
        consumer=consumer,
        bucket_name=MINIO_BUCKET,
        batch_size=BATCH_SIZE,
    )


if __name__ == "__main__":
    main()