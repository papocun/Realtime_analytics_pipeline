"""
Spotify Synthetic Event Producer
=================================
Produces synthetic Spotify-like listening events to a Kafka topic in three
explicit operating modes:

  A. HISTORICAL  – Generate a configurable number of events distributed over
                   a past time window. Designed for warehouse backfill.
  B. LIVE        – Continuously emit new events at a configured interval until
                   interrupted. Designed for streaming pipeline testing.
  C. REPLAY      – Re-publish a bounded fixture of events for idempotency and
                   consumer testing. Does NOT auto-replay the full dataset.

Usage:
  Set PRODUCER_MODE=historical|live|replay in stimulator/.env or environment,
  then run:  uv run python stimulator/datagenerator.py

Event schema (matches consumer, dbt staging, and Silver contract):
  event_id       – UUIDv4, unique per logical event
  user_id        – UUIDv5(seed + index), stable across restarts
  song_id        – UUIDv5(artist::song), stable across restarts
  artist_name    – string
  song_name      – string
  event_type     – play | pause | skip | add_to_playlist
  device_type    – mobile | desktop | web
  country        – US | UK | CA | AU | IN | DE
  timestamp      – UTC ISO-8601 string (e.g. 2026-10-20T14:05:37Z)
"""

import json
import logging
import os
import random
import signal
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterator, List, Optional

from dotenv import load_dotenv
from kafka import KafkaProducer
from kafka.errors import KafkaError

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger("producer")

# ---------------------------------------------------------------------------
# Load environment
# ---------------------------------------------------------------------------
_env_candidates = [
    os.path.join(os.path.dirname(__file__), ".env"),
    ".env",
]
for _cand in _env_candidates:
    if os.path.isfile(_cand):
        load_dotenv(_cand)
        break


# ---------------------------------------------------------------------------
# Configuration (all from env, validated at startup)
# ---------------------------------------------------------------------------

def _env_int(name: str, default: int) -> int:
    val = os.getenv(name)
    if val is None:
        return default
    try:
        return int(val)
    except ValueError:
        raise ValueError(f"Environment variable {name} must be an integer, got: {val!r}")


def _env_float(name: str, default: float) -> float:
    val = os.getenv(name)
    if val is None:
        return default
    try:
        return float(val)
    except ValueError:
        raise ValueError(f"Environment variable {name} must be a float, got: {val!r}")


class ProducerConfig:
    """Validated producer configuration from environment variables."""

    def __init__(self):
        self.kafka_bootstrap_servers: str = os.getenv(
            "KAFKA_BOOTSTRAP_SERVERS", "localhost:29092"
        )
        self.kafka_topic: str = os.getenv("KAFKA_TOPIC", "spotify-events")
        self.producer_mode: str = os.getenv("PRODUCER_MODE", "live").lower().strip()

        # Catalog sizes
        self.user_count: int = _env_int("USER_COUNT", 20)
        self.song_count: int = _env_int("SONG_COUNT", 6)
        self.artist_count: int = _env_int("ARTIST_COUNT", 6)

        # Historical backfill
        self.backfill_events: int = _env_int("BACKFILL_EVENTS", 1000)
        self.historical_days: int = _env_int("HISTORICAL_DAYS", 30)
        self.batch_size: int = _env_int("BATCH_SIZE", 50)
        self.random_seed: Optional[int] = (
            int(os.getenv("RANDOM_SEED")) if os.getenv("RANDOM_SEED") else None
        )

        # Live mode
        self.event_interval_seconds: float = _env_float("EVENT_INTERVAL_SECONDS", 1.0)

        # Replay mode
        self.replay_count: int = _env_int("REPLAY_COUNT", 20)

        self._validate()

    def _validate(self):
        allowed_modes = {"live", "historical", "replay"}
        if self.producer_mode not in allowed_modes:
            raise ValueError(
                f"PRODUCER_MODE must be one of {allowed_modes}, got: {self.producer_mode!r}"
            )
        if not self.kafka_bootstrap_servers:
            raise ValueError("KAFKA_BOOTSTRAP_SERVERS must be set")
        if not self.kafka_topic:
            raise ValueError("KAFKA_TOPIC must be set")
        if self.user_count < 1:
            raise ValueError("USER_COUNT must be >= 1")
        if self.batch_size < 1:
            raise ValueError("BATCH_SIZE must be >= 1")
        if self.backfill_events < 1:
            raise ValueError("BACKFILL_EVENTS must be >= 1")
        if self.historical_days < 1:
            raise ValueError("HISTORICAL_DAYS must be >= 1")
        if self.event_interval_seconds < 0:
            raise ValueError("EVENT_INTERVAL_SECONDS must be >= 0")
        if self.replay_count < 1:
            raise ValueError("REPLAY_COUNT must be >= 1")

    def summary(self) -> str:
        lines = [
            "=" * 60,
            "  Spotify Producer Configuration",
            "=" * 60,
            f"  Mode               : {self.producer_mode.upper()}",
            f"  Kafka Bootstrap    : {self.kafka_bootstrap_servers}",
            f"  Kafka Topic        : {self.kafka_topic}",
            f"  User Count         : {self.user_count}",
            f"  Song Count (target): {self.song_count}",
            f"  Artist Count       : {self.artist_count}",
        ]
        if self.producer_mode == "historical":
            lines += [
                f"  Backfill Events    : {self.backfill_events:,}",
                f"  Historical Days    : {self.historical_days}",
                f"  Batch Size         : {self.batch_size}",
                f"  Random Seed        : {self.random_seed}",
            ]
        elif self.producer_mode == "live":
            lines += [
                f"  Event Interval (s) : {self.event_interval_seconds}",
            ]
        elif self.producer_mode == "replay":
            lines += [
                f"  Replay Count       : {self.replay_count}",
            ]
        lines.append("=" * 60)
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Stable Catalog  (deterministic IDs across restarts)
# ---------------------------------------------------------------------------

# Hard-coded song/artist pairs that form the baseline catalog.
# Additional songs are procedurally generated using UUIDv5 seeds so their
# IDs are identical between runs (stable across producer restarts).
_BASELINE_PAIRS: List[Dict] = [
    {"artist": "The Weeknd",   "song": "Blinding Lights"},
    {"artist": "Dua Lipa",     "song": "Levitating"},
    {"artist": "Drake",        "song": "God's Plan"},
    {"artist": "Taylor Swift", "song": "Love Story"},
    {"artist": "Ed Sheeran",   "song": "Shape of You"},
    {"artist": "Kanye West",   "song": "Stronger"},
]

EVENT_TYPES  = ["play", "pause", "skip", "add_to_playlist"]
DEVICE_TYPES = ["mobile", "desktop", "web"]
COUNTRIES    = ["US", "UK", "CA", "AU", "IN", "DE"]

# Weighted distributions reflecting realistic listening patterns
_EVENT_TYPE_WEIGHTS  = [0.40, 0.25, 0.22, 0.13]   # play, pause, skip, add_to_playlist
_DEVICE_TYPE_WEIGHTS = [0.37, 0.34, 0.29]           # desktop, mobile, web
_COUNTRY_WEIGHTS     = [0.30, 0.18, 0.17, 0.16, 0.12, 0.07]  # US, UK, CA, AU, IN, DE

# UUIDv5 namespace for deterministic ID generation
_CATALOG_NAMESPACE = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")


def _song_id(artist: str, song: str) -> str:
    """Deterministic song_id: identical across restarts."""
    return str(uuid.uuid5(_CATALOG_NAMESPACE, f"{artist}::{song}"))


def _user_id(seed_name: str, index: int) -> str:
    """Deterministic user_id: identical across restarts for the same seed_name+index."""
    return str(uuid.uuid5(_CATALOG_NAMESPACE, f"user::{seed_name}::{index}"))


def build_catalog(cfg: ProducerConfig) -> Dict:
    """Build stable song/artist/user catalog from configuration."""
    # Songs: start with baseline, extend with generated pairs
    pairs = _BASELINE_PAIRS[: min(cfg.song_count, len(_BASELINE_PAIRS))]
    if cfg.song_count > len(_BASELINE_PAIRS):
        for i in range(cfg.song_count - len(_BASELINE_PAIRS)):
            art = f"Artist_{i + 1}"
            song = f"Track_{i + 1}"
            pairs.append({"artist": art, "song": song})

    for p in pairs:
        p["song_id"] = _song_id(p["artist"], p["song"])

    # Users: stable IDs
    seed_name = str(cfg.random_seed) if cfg.random_seed is not None else "default"
    users = [_user_id(seed_name, i) for i in range(cfg.user_count)]

    return {"songs": pairs, "users": users}


# ---------------------------------------------------------------------------
# Event generation
# ---------------------------------------------------------------------------

def _utc_ts(dt: datetime) -> str:
    """Format a datetime as an ISO-8601 UTC string ending in Z."""
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def generate_event(catalog: Dict, rng: random.Random, ts: Optional[datetime] = None) -> Dict:
    """
    Generate a single synthetic Spotify event.

    - event_id  : new UUIDv4 per call (unique per logical event).
    - user_id   : sampled from stable catalog.
    - song_id   : stable via UUIDv5.
    - timestamp : ts if provided, otherwise current UTC second.
    """
    pair = rng.choices(catalog["songs"], k=1)[0]
    user = rng.choice(catalog["users"])
    event_type  = rng.choices(EVENT_TYPES,  weights=_EVENT_TYPE_WEIGHTS,  k=1)[0]
    device_type = rng.choices(DEVICE_TYPES, weights=_DEVICE_TYPE_WEIGHTS, k=1)[0]
    country     = rng.choices(COUNTRIES,    weights=_COUNTRY_WEIGHTS,      k=1)[0]

    if ts is None:
        ts = datetime.now(timezone.utc)

    return {
        "event_id":    str(uuid.uuid4()),
        "user_id":     user,
        "song_id":     pair["song_id"],
        "artist_name": pair["artist"],
        "song_name":   pair["song"],
        "event_type":  event_type,
        "device_type": device_type,
        "country":     country,
        "timestamp":   _utc_ts(ts),
    }


def historical_events_iter(catalog: Dict, cfg: ProducerConfig) -> Iterator[Dict]:
    """
    Yield synthetic historical events one at a time.

    Timestamps are distributed randomly over [now - historical_days, now].
    Does NOT hold all events in memory simultaneously.
    """
    rng = random.Random(cfg.random_seed)
    end_ts   = datetime.now(timezone.utc)
    start_ts = end_ts - timedelta(days=cfg.historical_days)
    span_seconds = int((end_ts - start_ts).total_seconds())

    for _ in range(cfg.backfill_events):
        offset = rng.randint(0, span_seconds)
        ts = start_ts + timedelta(seconds=offset)
        yield generate_event(catalog, rng, ts=ts)


def replay_fixture(catalog: Dict, cfg: ProducerConfig) -> List[Dict]:
    """
    Build a small, bounded replay fixture.

    The fixture uses a fixed seed so the same event IDs are generated
    each time for controlled idempotency/consumer testing.
    """
    rng = random.Random(42)  # fixed seed for reproducible replay
    end_ts   = datetime.now(timezone.utc)
    start_ts = end_ts - timedelta(hours=2)
    span_secs = int((end_ts - start_ts).total_seconds())

    fixture = []
    for i in range(cfg.replay_count):
        offset = rng.randint(0, span_secs)
        ts = start_ts + timedelta(seconds=offset)
        evt = generate_event(catalog, rng, ts=ts)
        evt["event_id"] = str(uuid.uuid5(_CATALOG_NAMESPACE, f"replay::{i}"))
        fixture.append(evt)

    return fixture


# ---------------------------------------------------------------------------
# Kafka delivery helpers
# ---------------------------------------------------------------------------

_delivery_errors: List[str] = []

def _on_send_error(exc: Exception):
    msg = f"Delivery error: {exc}"
    log.error(msg)
    _delivery_errors.append(msg)


def build_producer(cfg: ProducerConfig) -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=[cfg.kafka_bootstrap_servers],
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        acks="all",               # wait for leader + ISR acknowledgement
        retries=3,
        retry_backoff_ms=300,
        linger_ms=10,             # small batching window
        max_block_ms=10_000,
    )


def send_event(producer: KafkaProducer, topic: str, event: Dict):
    """Send a single event; attach error callback."""
    producer.send(topic, event).add_errback(_on_send_error)


# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------
_shutdown_requested = False


def _handle_sigint(signum, frame):
    global _shutdown_requested
    log.info("Shutdown signal received. Finishing current batch…")
    _shutdown_requested = True


signal.signal(signal.SIGINT, _handle_sigint)
signal.signal(signal.SIGTERM, _handle_sigint)


# ---------------------------------------------------------------------------
# Mode A: Historical backfill
# ---------------------------------------------------------------------------

def run_historical(cfg: ProducerConfig, catalog: Dict):
    log.info("▶  Mode: HISTORICAL BACKFILL")
    log.info(
        f"   Target: {cfg.backfill_events:,} events over {cfg.historical_days} days"
    )
    log.warning(
        "   NOTE: Historical events will appear in Bronze with past timestamps."
        " Airflow ingests hourly; new files will be picked up on the next DAG run."
    )

    producer = build_producer(cfg)
    published = 0
    errors_before = len(_delivery_errors)

    try:
        batch = []
        for event in historical_events_iter(catalog, cfg):
            if _shutdown_requested:
                log.info("Interrupted. Flushing remaining batch…")
                break

            batch.append(event)

            if len(batch) >= cfg.batch_size:
                for evt in batch:
                    send_event(producer, cfg.kafka_topic, evt)
                producer.flush()
                published += len(batch)
                log.info(
                    f"Progress: {published:,}/{cfg.backfill_events:,} events published "
                    f"({published / cfg.backfill_events * 100:.1f}%)"
                )
                batch = []

        # Flush remainder
        if batch and not _shutdown_requested:
            for evt in batch:
                send_event(producer, cfg.kafka_topic, evt)
            producer.flush()
            published += len(batch)

    finally:
        producer.close()

    new_errors = len(_delivery_errors) - errors_before
    log.info("=" * 60)
    log.info(f"  Historical backfill complete.")
    log.info(f"  Events published  : {published:,}")
    log.info(f"  Delivery errors   : {new_errors}")
    if new_errors > 0:
        log.warning(f"  Last errors       : {_delivery_errors[-5:]}")
    log.info("=" * 60)


# ---------------------------------------------------------------------------
# Mode B: Continuous live mode
# ---------------------------------------------------------------------------

def run_live(cfg: ProducerConfig, catalog: Dict):
    log.info("▶  Mode: LIVE (continuous, Ctrl+C to stop)")
    log.info(f"   Event interval: {cfg.event_interval_seconds}s")
    rng = random.Random()  # non-seeded: different each run

    producer = build_producer(cfg)
    published = 0
    errors_before = len(_delivery_errors)

    try:
        while not _shutdown_requested:
            event = generate_event(catalog, rng)
            send_event(producer, cfg.kafka_topic, event)
            published += 1
            log.info(
                f"Published [{published}] {event['event_type']:16s} | "
                f"{event['song_name']:20s} | {event['artist_name']:15s} | "
                f"{event['country']} | {event['device_type']}"
            )

            # Flush every batch_size messages to avoid unbounded memory growth
            if published % cfg.batch_size == 0:
                producer.flush()

            if cfg.event_interval_seconds > 0:
                time.sleep(cfg.event_interval_seconds)

    finally:
        producer.flush()
        producer.close()

    new_errors = len(_delivery_errors) - errors_before
    log.info(f"Live mode stopped. Published: {published:,}, Errors: {new_errors}")


# ---------------------------------------------------------------------------
# Mode C: Replay / test mode
# ---------------------------------------------------------------------------

def run_replay(cfg: ProducerConfig, catalog: Dict):
    log.info("▶  Mode: REPLAY/TEST")
    log.info(
        f"   Replaying {cfg.replay_count} deterministic fixture events "
        "(fixed seed=42 — same event_ids every run)."
    )
    log.warning(
        "   REPLAY uses intentionally stable event_ids to test idempotency. "
        "Do NOT run replay against production Silver if deduplication is disabled."
    )

    fixture = replay_fixture(catalog, cfg)
    producer = build_producer(cfg)
    published = 0

    try:
        for event in fixture:
            if _shutdown_requested:
                break
            send_event(producer, cfg.kafka_topic, event)
            published += 1
            log.info(
                f"  Replayed [{published}/{len(fixture)}] event_id={event['event_id'][:12]}… "
                f"| {event['event_type']} | {event['song_name']}"
            )

        producer.flush()

    finally:
        producer.close()

    log.info(f"Replay complete. Published: {published}/{len(fixture)}")
    log.info(
        "  TIP: Run again to confirm Silver deduplication (same event_ids "
        "must not produce duplicate canonical rows)."
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    try:
        cfg = ProducerConfig()
    except ValueError as e:
        log.error(f"Configuration error: {e}")
        sys.exit(1)

    print(cfg.summary())

    catalog = build_catalog(cfg)
    log.info(
        f"Catalog ready: {len(catalog['songs'])} songs, {len(catalog['users'])} users"
    )
    for p in catalog["songs"]:
        log.info(f"  Song: {p['song']:25s} — {p['artist']:20s} | song_id={p['song_id']}")

    try:
        if cfg.producer_mode == "historical":
            run_historical(cfg, catalog)
        elif cfg.producer_mode == "live":
            run_live(cfg, catalog)
        elif cfg.producer_mode == "replay":
            run_replay(cfg, catalog)
    except KafkaError as ke:
        log.error(f"Kafka error: {ke}")
        sys.exit(1)
    except Exception as exc:
        log.exception(f"Unexpected error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()