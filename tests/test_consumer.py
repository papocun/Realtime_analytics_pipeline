"""
tests/test_consumer.py
======================
Unit tests for consumer/kafka_to_minio.py reliability improvements:
1. Successful batch upload to MinIO followed by synchronous Kafka offset commit.
2. Failed MinIO upload does NOT commit offsets, logs error, and raises safely.
3. Graceful shutdown flushes any pending batch before consumer closes and commits
   offsets only upon successful upload.
4. Failed upload during shutdown does NOT commit offsets.
5. Correct partition-level offset calculation (last offset + 1 per partition).
6. Idempotent bucket creation.
7. Verification that enable_auto_commit=False is configured.

These tests mock Kafka and MinIO so they run completely offline with no live services.
"""

import json
from collections import namedtuple
from pathlib import Path
import sys
from unittest.mock import MagicMock, call, patch

import pytest
from kafka import OffsetAndMetadata, TopicPartition

# Add repo root to sys.path so consumer can be imported
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from consumer.kafka_to_minio import (
    GracefulShutdown,
    build_commit_offsets,
    consume_events,
    create_kafka_consumer,
    ensure_bucket_exists,
    upload_batch,
)

# Mock Kafka ConsumerRecord
FakeMessage = namedtuple("FakeMessage", ["topic", "partition", "offset", "value"])


def make_fake_event(event_id: str, user_id: str = "user-1", song_id: str = "song-1"):
    return {
        "event_id": event_id,
        "user_id": user_id,
        "song_id": song_id,
        "event_type": "play",
        "device_type": "mobile",
        "country": "US",
        "timestamp": "2026-10-25T12:00:00Z",
    }


# ===========================================================================
# 1. Successful Upload followed by Manual Commit
# ===========================================================================

def test_successful_upload_followed_by_commit():
    """
    Verify that when s3.put_object() succeeds:
    1. MinIO receives a valid JSON Lines document under the correct prefix.
    2. consumer.commit() is invoked with the next offset (last_offset + 1).
    3. Commit occurs strictly AFTER put_object succeeds.
    """
    mock_s3 = MagicMock()
    mock_consumer = MagicMock()

    call_order = []
    mock_s3.put_object.side_effect = lambda **kwargs: call_order.append("s3_put")
    mock_consumer.commit.side_effect = lambda offsets: call_order.append("kafka_commit")

    batch = [
        FakeMessage(topic="spotify-events", partition=0, offset=100, value=make_fake_event("evt-1")),
        FakeMessage(topic="spotify-events", partition=0, offset=101, value=make_fake_event("evt-2")),
        FakeMessage(topic="spotify-events", partition=0, offset=102, value=make_fake_event("evt-3")),
    ]

    file_path = upload_batch(
        s3_client=mock_s3,
        consumer=mock_consumer,
        batch=batch,
        bucket_name="test-bucket",
        max_retries=1,
    )

    # 1. S3 upload called
    assert mock_s3.put_object.call_count == 1
    s3_kwargs = mock_s3.put_object.call_args.kwargs
    assert s3_kwargs["Bucket"] == "test-bucket"
    assert s3_kwargs["Key"].startswith("bronze/date=")
    assert s3_kwargs["Key"].endswith(".json")

    # Verify JSON Lines payload
    body_lines = s3_kwargs["Body"].decode("utf-8").strip().split("\n")
    assert len(body_lines) == 3
    parsed_events = [json.loads(line) for line in body_lines]
    assert [e["event_id"] for e in parsed_events] == ["evt-1", "evt-2", "evt-3"]

    # 2. Kafka commit called with next offset (102 + 1 = 103)
    assert mock_consumer.commit.call_count == 1
    expected_tp = TopicPartition("spotify-events", 0)
    expected_offset = OffsetAndMetadata(103, "")
    assert mock_consumer.commit.call_args.kwargs["offsets"] == {expected_tp: expected_offset}

    # 3. Order verification: commit MUST happen after S3 upload
    assert call_order == ["s3_put", "kafka_commit"]
    assert file_path == s3_kwargs["Key"]


# ===========================================================================
# 2. Failed Upload: Error Logged, No Commit, Batch Preserved
# ===========================================================================

def test_failed_upload_does_not_commit():
    """
    Verify that when s3.put_object() fails:
    1. consumer.commit() is NEVER called.
    2. RuntimeError is raised to prevent silent batch loss.
    """
    mock_s3 = MagicMock()
    mock_s3.put_object.side_effect = ConnectionResetError("MinIO connection reset")
    mock_consumer = MagicMock()

    batch = [
        FakeMessage(topic="spotify-events", partition=0, offset=200, value=make_fake_event("evt-failed")),
    ]

    with pytest.raises(RuntimeError) as exc_info:
        upload_batch(
            s3_client=mock_s3,
            consumer=mock_consumer,
            batch=batch,
            bucket_name="test-bucket",
            max_retries=2,
            retry_delay=0.01,
        )

    assert "Failed to upload batch to MinIO" in str(exc_info.value)
    # Critical reliability check: commit MUST NOT be called when upload fails
    mock_consumer.commit.assert_not_called()


# ===========================================================================
# 3. Graceful Shutdown: Flush Pending Batch and Commit
# ===========================================================================

def test_graceful_shutdown_flushes_pending_batch_and_commits():
    """
    Simulate Ctrl+C (KeyboardInterrupt) when a pending batch is smaller than
    BATCH_SIZE. Verify that:
    1. The pending batch is uploaded before shutdown.
    2. Offsets for the pending batch are committed.
    3. The consumer is cleanly closed.
    """
    mock_s3 = MagicMock()
    mock_consumer = MagicMock()

    events = [
        FakeMessage(topic="spotify-events", partition=0, offset=50, value=make_fake_event("evt-p1")),
        FakeMessage(topic="spotify-events", partition=0, offset=51, value=make_fake_event("evt-p2")),
    ]

    def message_generator():
        for m in events:
            yield m
        # User hits Ctrl+C after 2 messages (batch_size is 5, so no automatic flush occurred)
        raise KeyboardInterrupt()

    mock_consumer.__iter__ = lambda self: message_generator()

    consume_events(
        s3_client=mock_s3,
        consumer=mock_consumer,
        bucket_name="test-bucket",
        batch_size=5,
    )

    # 1. Pending batch of 2 was flushed to MinIO
    assert mock_s3.put_object.call_count == 1
    payload = mock_s3.put_object.call_args.kwargs["Body"].decode("utf-8").strip().split("\n")
    assert len(payload) == 2

    # 2. Offsets for pending batch committed (offset 51 + 1 = 52)
    assert mock_consumer.commit.call_count == 1
    expected_tp = TopicPartition("spotify-events", 0)
    assert mock_consumer.commit.call_args.kwargs["offsets"] == {expected_tp: OffsetAndMetadata(52, "")}

    # 3. Consumer closed cleanly
    mock_consumer.close.assert_called_once()


def test_graceful_shutdown_sigterm_flushes_pending_batch():
    """
    Simulate SIGTERM triggering GracefulShutdown exception. Verify pending batch
    flush, commit, and consumer close.
    """
    mock_s3 = MagicMock()
    mock_consumer = MagicMock()

    events = [
        FakeMessage(topic="spotify-events", partition=0, offset=10, value=make_fake_event("evt-sig")),
    ]

    def message_generator():
        for m in events:
            yield m
        raise GracefulShutdown()

    mock_consumer.__iter__ = lambda self: message_generator()

    consume_events(
        s3_client=mock_s3,
        consumer=mock_consumer,
        bucket_name="test-bucket",
        batch_size=10,
    )

    assert mock_s3.put_object.call_count == 1
    assert mock_consumer.commit.call_count == 1
    assert mock_consumer.close.call_count == 1


# ===========================================================================
# 4. Failed Upload During Shutdown Does NOT Commit
# ===========================================================================

def test_failed_upload_during_shutdown_does_not_commit():
    """
    If MinIO fails while flushing a pending batch during shutdown:
    Offsets must NOT be committed, and consumer.close() is still called.
    """
    mock_s3 = MagicMock()
    mock_s3.put_object.side_effect = Exception("MinIO unavailable")
    mock_consumer = MagicMock()

    events = [
        FakeMessage(topic="spotify-events", partition=0, offset=99, value=make_fake_event("evt-fail-sd")),
    ]

    def message_generator():
        for m in events:
            yield m
        raise KeyboardInterrupt()

    mock_consumer.__iter__ = lambda self: message_generator()

    with pytest.raises(RuntimeError):
        consume_events(
            s3_client=mock_s3,
            consumer=mock_consumer,
            bucket_name="test-bucket",
            batch_size=10,
            max_retries=1,
            retry_delay=0.01,
        )

    # Offset MUST NOT be committed
    mock_consumer.commit.assert_not_called()
    # Consumer cleanup still occurred
    mock_consumer.close.assert_called_once()


# ===========================================================================
# 5. Batch Boundary Ingestion (Multiple Batches + Remainder)
# ===========================================================================

def test_batch_boundary_and_remainder_handling():
    """
    7 messages with batch_size=3:
    - Batch 1 (messages 0, 1, 2): flushed immediately and committed (offset 3)
    - Batch 2 (messages 3, 4, 5): flushed immediately and committed (offset 6)
    - Message 6: pending when iteration ends, flushed during cleanup (offset 7)
    Total uploads = 3, Total commits = 3.
    """
    mock_s3 = MagicMock()
    mock_consumer = MagicMock()

    messages = [
        FakeMessage(topic="spotify-events", partition=0, offset=i, value=make_fake_event(f"evt-{i}"))
        for i in range(7)
    ]
    mock_consumer.__iter__ = lambda self: iter(messages)

    consume_events(
        s3_client=mock_s3,
        consumer=mock_consumer,
        bucket_name="test-bucket",
        batch_size=3,
    )

    assert mock_s3.put_object.call_count == 3
    assert mock_consumer.commit.call_count == 3

    tp = TopicPartition("spotify-events", 0)
    commit_calls = [c.kwargs["offsets"][tp].offset for c in mock_consumer.commit.call_args_list]
    assert commit_calls == [3, 6, 7]
    mock_consumer.close.assert_called_once()


# ===========================================================================
# 6. Multi-Partition Offset Tracking
# ===========================================================================

def test_multi_partition_offset_tracking():
    """
    A batch containing messages from multiple partitions should commit the
    correct next offset (max_offset + 1) for each individual partition.
    """
    batch = [
        FakeMessage(topic="spotify-events", partition=0, offset=10, value=make_fake_event("e1")),
        FakeMessage(topic="spotify-events", partition=1, offset=50, value=make_fake_event("e2")),
        FakeMessage(topic="spotify-events", partition=0, offset=11, value=make_fake_event("e3")),
        FakeMessage(topic="spotify-events", partition=1, offset=55, value=make_fake_event("e4")),
        FakeMessage(topic="spotify-events", partition=2, offset=5, value=make_fake_event("e5")),
    ]

    offsets = build_commit_offsets(batch)

    assert len(offsets) == 3
    assert offsets[TopicPartition("spotify-events", 0)] == OffsetAndMetadata(12, "")
    assert offsets[TopicPartition("spotify-events", 1)] == OffsetAndMetadata(56, "")
    assert offsets[TopicPartition("spotify-events", 2)] == OffsetAndMetadata(6, "")


# ===========================================================================
# 7. Auto Commit Configuration Verification
# ===========================================================================

@patch("consumer.kafka_to_minio.KafkaConsumer")
def test_consumer_configuration_auto_commit_false(mock_kafka_cls):
    """
    Verify create_kafka_consumer initializes KafkaConsumer with enable_auto_commit=False
    and no duplicate arguments.
    """
    with patch.dict(
        "os.environ",
        {
            "KAFKA_TOPIC": "test-topic",
            "KAFKA_BOOTSTRAP_SERVER": "localhost:9092",
            "KAFKA_GROUP_ID": "test-group",
        },
    ):
        create_kafka_consumer()

    assert mock_kafka_cls.call_count == 1
    args, kwargs = mock_kafka_cls.call_args

    assert args[0] == "test-topic" or kwargs.get("topic") == "test-topic"
    assert kwargs["enable_auto_commit"] is False
    assert kwargs["auto_offset_reset"] == "earliest"
    assert kwargs["group_id"] == "test-group"


# ===========================================================================
# 8. Idempotent Bucket Creation
# ===========================================================================

def test_ensure_bucket_exists_already_present():
    mock_s3 = MagicMock()
    mock_s3.head_bucket.return_value = {}

    ensure_bucket_exists(mock_s3, "spotify")

    mock_s3.head_bucket.assert_called_once_with(Bucket="spotify")
    mock_s3.create_bucket.assert_not_called()


def test_ensure_bucket_exists_creates_when_missing():
    mock_s3 = MagicMock()
    mock_s3.head_bucket.side_effect = Exception("404 Not Found")

    ensure_bucket_exists(mock_s3, "spotify")

    mock_s3.head_bucket.assert_called_once_with(Bucket="spotify")
    mock_s3.create_bucket.assert_called_once_with(Bucket="spotify")
