"""
tests/test_producer.py
======================
Offline unit tests for the upgraded Spotify event producer.

These tests require NO live Kafka, MinIO, or Snowflake connections and are
safe to run in CI with no credentials.

Run:
    uv run --with pytest pytest tests/test_producer.py -v
"""

import sys
import uuid
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest

# Allow importing producer module directly from stimulator directory
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "stimulator"))

from datagenerator import (
    ProducerConfig,
    build_catalog,
    generate_event,
    historical_events_iter,
    replay_fixture,
    _song_id,
    _user_id,
    EVENT_TYPES,
    DEVICE_TYPES,
    COUNTRIES,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_config(**kwargs):
    """Build a ProducerConfig with overridden env vars, using a fixed seed."""
    env = {
        "KAFKA_BOOTSTRAP_SERVERS": "localhost:9092",
        "KAFKA_TOPIC": "test-topic",
        "PRODUCER_MODE": "live",
        "USER_COUNT": "10",
        "SONG_COUNT": "6",
        "ARTIST_COUNT": "6",
        "BACKFILL_EVENTS": "100",
        "HISTORICAL_DAYS": "7",
        "BATCH_SIZE": "10",
        "RANDOM_SEED": "42",
        "EVENT_INTERVAL_SECONDS": "0",
        "REPLAY_COUNT": "5",
    }
    env.update({k.upper(): str(v) for k, v in kwargs.items()})
    with patch.dict("os.environ", env, clear=False):
        return ProducerConfig()


# ---------------------------------------------------------------------------
# Section 1: Configuration validation
# ---------------------------------------------------------------------------

class TestProducerConfig:

    def test_default_live_mode(self):
        cfg = make_config()
        assert cfg.producer_mode == "live"

    def test_historical_mode(self):
        cfg = make_config(producer_mode="historical")
        assert cfg.producer_mode == "historical"

    def test_replay_mode(self):
        cfg = make_config(producer_mode="replay")
        assert cfg.producer_mode == "replay"

    def test_invalid_mode_raises(self):
        with pytest.raises(ValueError, match="PRODUCER_MODE"):
            make_config(producer_mode="streaming")

    def test_user_count_parsed(self):
        cfg = make_config(user_count=50)
        assert cfg.user_count == 50

    def test_batch_size_parsed(self):
        cfg = make_config(batch_size=100)
        assert cfg.batch_size == 100

    def test_backfill_events_parsed(self):
        cfg = make_config(backfill_events=5000)
        assert cfg.backfill_events == 5000

    def test_random_seed_parsed(self):
        cfg = make_config(random_seed=99)
        assert cfg.random_seed == 99

    def test_no_random_seed(self):
        env = {
            "KAFKA_BOOTSTRAP_SERVERS": "localhost:9092",
            "KAFKA_TOPIC": "test",
            "PRODUCER_MODE": "live",
            "USER_COUNT": "5",
        }
        with patch.dict("os.environ", env, clear=False):
            # Remove RANDOM_SEED from env if present
            import os
            saved = os.environ.pop("RANDOM_SEED", None)
            try:
                cfg = ProducerConfig()
                assert cfg.random_seed is None
            finally:
                if saved:
                    os.environ["RANDOM_SEED"] = saved

    def test_invalid_user_count_raises(self):
        with pytest.raises(ValueError):
            make_config(user_count=0)

    def test_invalid_batch_size_raises(self):
        with pytest.raises(ValueError):
            make_config(batch_size=0)

    def test_summary_contains_mode(self):
        cfg = make_config(producer_mode="historical")
        summary = cfg.summary()
        assert "HISTORICAL" in summary
        assert cfg.kafka_topic in summary


# ---------------------------------------------------------------------------
# Section 2: Stable entity IDs across restarts
# ---------------------------------------------------------------------------

class TestStableEntityIDs:

    def test_song_id_is_deterministic(self):
        """Same artist::song always produces the same UUID5."""
        sid1 = _song_id("The Weeknd", "Blinding Lights")
        sid2 = _song_id("The Weeknd", "Blinding Lights")
        assert sid1 == sid2

    def test_song_id_differs_for_different_songs(self):
        sid1 = _song_id("The Weeknd", "Blinding Lights")
        sid2 = _song_id("Dua Lipa", "Levitating")
        assert sid1 != sid2

    def test_user_id_is_deterministic(self):
        """Same seed_name + index always produces the same UUID5."""
        uid1 = _user_id("default", 0)
        uid2 = _user_id("default", 0)
        assert uid1 == uid2

    def test_user_id_differs_for_different_indices(self):
        uid0 = _user_id("default", 0)
        uid1 = _user_id("default", 1)
        assert uid0 != uid1

    def test_catalog_song_ids_stable_across_two_builds(self):
        cfg = make_config(song_count=6, random_seed=42)
        cat1 = build_catalog(cfg)
        cat2 = build_catalog(cfg)
        ids1 = {p["song_id"] for p in cat1["songs"]}
        ids2 = {p["song_id"] for p in cat2["songs"]}
        assert ids1 == ids2

    def test_catalog_user_ids_stable_across_two_builds(self):
        cfg = make_config(user_count=10, random_seed=42)
        cat1 = build_catalog(cfg)
        cat2 = build_catalog(cfg)
        assert cat1["users"] == cat2["users"]

    def test_catalog_user_ids_change_with_different_seed(self):
        cfg_a = make_config(user_count=5, random_seed=1)
        cfg_b = make_config(user_count=5, random_seed=2)
        cat_a = build_catalog(cfg_a)
        cat_b = build_catalog(cfg_b)
        # Different seeds → different user IDs
        assert cat_a["users"] != cat_b["users"]


# ---------------------------------------------------------------------------
# Section 3: Event schema validity
# ---------------------------------------------------------------------------

class TestEventSchema:

    REQUIRED_FIELDS = {
        "event_id", "user_id", "song_id", "artist_name",
        "song_name", "event_type", "device_type", "country", "timestamp"
    }

    def _make_event(self, seed=7):
        cfg = make_config(user_count=5, song_count=6, random_seed=seed)
        catalog = build_catalog(cfg)
        rng = random.Random(seed)
        return generate_event(catalog, rng)

    def test_event_has_all_required_fields(self):
        event = self._make_event()
        assert self.REQUIRED_FIELDS.issubset(set(event.keys())), (
            f"Missing fields: {self.REQUIRED_FIELDS - set(event.keys())}"
        )

    def test_event_id_is_valid_uuid4(self):
        event = self._make_event()
        parsed = uuid.UUID(event["event_id"])
        assert parsed.version == 4

    def test_event_type_in_allowed_set(self):
        event = self._make_event()
        assert event["event_type"] in EVENT_TYPES

    def test_device_type_in_allowed_set(self):
        event = self._make_event()
        assert event["device_type"] in DEVICE_TYPES

    def test_country_in_allowed_set(self):
        event = self._make_event()
        assert event["country"] in COUNTRIES

    def test_timestamp_format_utc_z_suffix(self):
        """Timestamp must end in Z and be parseable as UTC ISO-8601."""
        event = self._make_event()
        ts = event["timestamp"]
        assert ts.endswith("Z"), f"Timestamp must end with Z, got: {ts!r}"
        # Should parse without error
        dt = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        # Must be a past timestamp (within a reasonable range)
        now = datetime.now(timezone.utc)
        assert dt <= now + timedelta(seconds=5)

    def test_song_id_is_valid_uuid(self):
        event = self._make_event()
        parsed = uuid.UUID(event["song_id"])
        assert parsed.version == 5  # UUID5 for stability

    def test_event_ids_are_unique_across_multiple_calls(self):
        """Each call to generate_event must produce a distinct event_id."""
        cfg = make_config(user_count=5, song_count=6, random_seed=1)
        catalog = build_catalog(cfg)
        rng = random.Random(1)
        ids = [generate_event(catalog, rng)["event_id"] for _ in range(200)]
        assert len(set(ids)) == 200, "Event IDs must be globally unique"

    def test_user_id_belongs_to_catalog(self):
        cfg = make_config(user_count=5, song_count=6, random_seed=3)
        catalog = build_catalog(cfg)
        rng = random.Random(3)
        user_set = set(catalog["users"])
        for _ in range(50):
            event = generate_event(catalog, rng)
            assert event["user_id"] in user_set

    def test_song_name_matches_artist(self):
        """song_name and artist_name must always appear as a pair from the catalog."""
        cfg = make_config(user_count=5, song_count=6, random_seed=5)
        catalog = build_catalog(cfg)
        rng = random.Random(5)
        pair_map = {p["song"]: p["artist"] for p in catalog["songs"]}
        for _ in range(100):
            event = generate_event(catalog, rng)
            assert pair_map.get(event["song_name"]) == event["artist_name"]


# ---------------------------------------------------------------------------
# Section 4: Historical backfill iterator
# ---------------------------------------------------------------------------

class TestHistoricalBackfillIterator:

    def test_yields_correct_count(self):
        cfg = make_config(backfill_events=200, historical_days=7, random_seed=42)
        catalog = build_catalog(cfg)
        events = list(historical_events_iter(catalog, cfg))
        assert len(events) == 200

    def test_all_timestamps_within_range(self):
        cfg = make_config(backfill_events=100, historical_days=10, random_seed=42)
        catalog = build_catalog(cfg)
        now = datetime.now(timezone.utc)
        earliest = now - timedelta(days=10 + 1)  # small buffer for test timing
        for event in historical_events_iter(catalog, cfg):
            ts = datetime.strptime(event["timestamp"], "%Y-%m-%dT%H:%M:%SZ").replace(
                tzinfo=timezone.utc
            )
            assert ts <= now + timedelta(seconds=5), f"Future timestamp: {ts}"
            assert ts >= earliest, f"Too-old timestamp: {ts}"

    def test_no_memory_spike_via_lazy_iteration(self):
        """Iterator must be lazy (does not materialise all events at once)."""
        cfg = make_config(backfill_events=5000, historical_days=30, random_seed=7)
        catalog = build_catalog(cfg)
        gen = historical_events_iter(catalog, cfg)
        # Pull only first 10 — remainder should not be pre-computed
        for _ in range(10):
            next(gen)

    def test_reproducible_with_same_seed(self):
        cfg = make_config(backfill_events=50, historical_days=7, random_seed=99)
        catalog = build_catalog(cfg)
        run1 = [e["event_id"] for e in historical_events_iter(catalog, cfg)]
        run2 = [e["event_id"] for e in historical_events_iter(catalog, cfg)]
        # event_ids are UUIDv4 (random), but event types/songs should be identical
        evts1 = [
            (e["event_type"], e["song_id"], e["country"])
            for e in historical_events_iter(catalog, cfg)
        ]
        evts2 = [
            (e["event_type"], e["song_id"], e["country"])
            for e in historical_events_iter(catalog, cfg)
        ]
        assert evts1 == evts2  # same seed → same choices

    def test_schema_valid_for_all_events(self):
        cfg = make_config(backfill_events=30, historical_days=5, random_seed=1)
        catalog = build_catalog(cfg)
        required = {
            "event_id", "user_id", "song_id", "artist_name",
            "song_name", "event_type", "device_type", "country", "timestamp"
        }
        for event in historical_events_iter(catalog, cfg):
            assert required.issubset(set(event.keys()))
            assert event["event_type"] in EVENT_TYPES
            assert event["country"] in COUNTRIES
            assert event["device_type"] in DEVICE_TYPES


# ---------------------------------------------------------------------------
# Section 5: Replay fixture
# ---------------------------------------------------------------------------

class TestReplayFixture:

    def test_replay_fixture_count(self):
        cfg = make_config(replay_count=10)
        catalog = build_catalog(cfg)
        fixture = replay_fixture(catalog, cfg)
        assert len(fixture) == 10

    def test_replay_event_ids_are_stable(self):
        """Same fixture event_ids must be identical on every invocation."""
        cfg = make_config(replay_count=15)
        catalog = build_catalog(cfg)
        ids1 = [e["event_id"] for e in replay_fixture(catalog, cfg)]
        ids2 = [e["event_id"] for e in replay_fixture(catalog, cfg)]
        assert ids1 == ids2

    def test_replay_event_ids_are_uuid5(self):
        cfg = make_config(replay_count=5)
        catalog = build_catalog(cfg)
        for event in replay_fixture(catalog, cfg):
            parsed = uuid.UUID(event["event_id"])
            assert parsed.version == 5  # deterministic UUIDv5

    def test_replay_schema_valid(self):
        cfg = make_config(replay_count=5)
        catalog = build_catalog(cfg)
        required = {
            "event_id", "user_id", "song_id", "artist_name",
            "song_name", "event_type", "device_type", "country", "timestamp"
        }
        for event in replay_fixture(catalog, cfg):
            assert required.issubset(set(event.keys()))

    def test_replay_different_from_live_events(self):
        """Replay event_ids should be UUID5 (stable); live events use UUID4."""
        cfg = make_config(replay_count=5)
        catalog = build_catalog(cfg)
        rng = random.Random()
        live_event = generate_event(catalog, rng)
        live_id = uuid.UUID(live_event["event_id"])
        assert live_id.version == 4  # live uses UUID4

        replay_event = replay_fixture(catalog, cfg)[0]
        replay_id = uuid.UUID(replay_event["event_id"])
        assert replay_id.version == 5  # replay uses UUID5


# ---------------------------------------------------------------------------
# Section 6: Kafka delivery (mocked)
# ---------------------------------------------------------------------------

class TestKafkaDelivery:

    def test_send_event_calls_producer_send(self):
        """send_event must call producer.send with the correct topic and event."""
        from datagenerator import send_event
        mock_producer = MagicMock()
        mock_future = MagicMock()
        mock_producer.send.return_value = mock_future
        mock_future.add_errback.return_value = mock_future

        event = {"event_id": "test-id", "event_type": "play"}
        send_event(mock_producer, "my-topic", event)

        mock_producer.send.assert_called_once_with("my-topic", event)

    def test_build_producer_uses_config(self):
        """build_producer must pass bootstrap servers from config."""
        from datagenerator import build_producer
        cfg = make_config(kafka_bootstrap_servers="kafka:9092")
        with patch("datagenerator.KafkaProducer") as MockKafka:
            MockKafka.return_value = MagicMock()
            build_producer(cfg)
            call_kwargs = MockKafka.call_args[1]
            assert "kafka:9092" in call_kwargs["bootstrap_servers"]
            assert call_kwargs["acks"] == "all"


# ---------------------------------------------------------------------------
# Section 7: Batch boundary verification
# ---------------------------------------------------------------------------

class TestBatchBoundaries:

    def test_historical_batch_respects_batch_size(self):
        """
        Verify that historical_events_iter yields exactly BACKFILL_EVENTS
        events, regardless of whether BACKFILL_EVENTS is not a multiple of
        BATCH_SIZE.
        """
        for backfill, batch in [(100, 7), (101, 10), (50, 50), (1, 10)]:
            cfg = make_config(backfill_events=backfill, batch_size=batch, random_seed=1)
            catalog = build_catalog(cfg)
            events = list(historical_events_iter(catalog, cfg))
            assert len(events) == backfill, (
                f"Expected {backfill} events with batch={batch}, got {len(events)}"
            )
