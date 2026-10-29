import json
from collections import namedtuple
from pathlib import Path
import sys
from unittest.mock import MagicMock, call, patch

import pytest
from kafka import OffsetAndMetadata, TopicPartition

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


def test_successful_upload_followed_by_commit():
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

    assert mock_s3.put_object.call_count == 1
    s3_kwargs = mock_s3.put_object.call_args.kwargs
    assert s3_kwargs["Bucket"] == "test-bucket"
    assert s3_kwargs["Key"].startswith("bronze/date=")
    assert s3_kwargs["Key"].endswith(".json")

    body_lines = s3_kwargs["Body"].decode("utf-8").strip().split("\n")
    assert len(body_lines) == 3
    parsed_events = [json.loads(line) for line in body_lines]
    assert [e["event_id"] for e in parsed_events] == ["evt-1", "evt-2", "evt-3"]

    assert mock_consumer.commit.call_count == 1
    expected_tp = TopicPartition("spotify-events", 0)
    expected_offset = OffsetAndMetadata(103, "")
    assert mock_consumer.commit.call_args.kwargs["offsets"] == {expected_tp: expected_offset}

    assert call_order == ["s3_put", "kafka_commit"]
    assert file_path == s3_kwargs["Key"]


def test_failed_upload_does_not_commit():
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
    mock_consumer.commit.assert_not_called()


def test_graceful_shutdown_flushes_pending_batch_and_commits():
    mock_s3 = MagicMock()
    mock_consumer = MagicMock()

    events = [
        FakeMessage(topic="spotify-events", partition=0, offset=50, value=make_fake_event("evt-p1")),
        FakeMessage(topic="spotify-events", partition=0, offset=51, value=make_fake_event("evt-p2")),
    ]

    def message_generator():
        for m in events:
            yield m
        raise KeyboardInterrupt()

    mock_consumer.__iter__ = lambda self: message_generator()

    consume_events(
        s3_client=mock_s3,
        consumer=mock_consumer,
        bucket_name="test-bucket",
        batch_size=5,
    )

    assert mock_s3.put_object.call_count == 1
    payload = mock_s3.put_object.call_args.kwargs["Body"].decode("utf-8").strip().split("\n")
    assert len(payload) == 2

    assert mock_consumer.commit.call_count == 1
    expected_tp = TopicPartition("spotify-events", 0)
    assert mock_consumer.commit.call_args.kwargs["offsets"] == {expected_tp: OffsetAndMetadata(52, "")}

    mock_consumer.close.assert_called_once()


def test_graceful_shutdown_sigterm_flushes_pending_batch():
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


def test_failed_upload_during_shutdown_does_not_commit():
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

    mock_consumer.commit.assert_not_called()
    mock_consumer.close.assert_called_once()


def test_batch_boundary_and_remainder_handling():
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


def test_multi_partition_offset_tracking():
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


@patch("consumer.kafka_to_minio.KafkaConsumer")
def test_consumer_configuration_auto_commit_false(mock_kafka_cls):
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
