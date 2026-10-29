"""Runs the dashboard's single consolidated Gold query and prints the result as JSON for the Next.js API route."""

import os
import re
import sys
import json
import argparse
from pathlib import Path
from decimal import Decimal

project_root = Path(__file__).resolve().parents[3]

_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")


def _identifier(name: str, value: str) -> str:
    # Database and schema names are interpolated into SQL, so only plain identifiers are accepted.
    if not _IDENTIFIER.match(value):
        raise ValueError(f"{name} must be a plain Snowflake identifier, got {value!r}")
    return value.upper()


def _load_env():
    from dotenv import load_dotenv

    # The dashboard's own settings win; the Airflow DAG file only fills in what is missing.
    for env_path in (project_root / "dashboard" / ".env", project_root / "docker" / "dags" / ".env"):
        if env_path.exists():
            load_dotenv(env_path, override=False)


def _resolve_key_path() -> Path:
    configured = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
    candidates = [Path(configured)] if configured else []
    if configured and not Path(configured).is_absolute():
        candidates.append(project_root / configured)
    candidates.append(project_root / "secrets" / "rsa_key.p8")
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("Snowflake private key not found; set SNOWFLAKE_PRIVATE_KEY_PATH")


_load_env()
DATABASE = _identifier("SNOWFLAKE_DATABASE", os.getenv("SNOWFLAKE_DATABASE", "SPOTIFY_DB"))
GOLD_SCHEMA = _identifier("SNOWFLAKE_GOLD_SCHEMA", os.getenv("SNOWFLAKE_GOLD_SCHEMA", "GOLD"))
GOLD = f"{DATABASE}.{GOLD_SCHEMA}"


def get_snowflake_connection():
    try:
        import snowflake.connector

        connect_args = dict(
            user=os.getenv("SNOWFLAKE_USER"),
            account=os.getenv("SNOWFLAKE_ACCOUNT"),
            private_key_file=str(_resolve_key_path()),
            warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
            database=DATABASE,
            schema=GOLD_SCHEMA,
            login_timeout=15,
            network_timeout=15,
        )
        role = os.getenv("SNOWFLAKE_ROLE")
        if role:
            connect_args["role"] = role
        return snowflake.connector.connect(**connect_args), None
    except Exception as e:
        return None, str(e)


def json_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def query_live_gold(event_type=None, device=None, country=None):
    conn, err = get_snowflake_connection()
    if not conn:
        return None, err
        
    try:
        cur = conn.cursor()
        
        where_clauses = ["1=1"]
        params = []
        if event_type and event_type != 'ALL':
            where_clauses.append("f.EVENT_TYPE = %s")
            params.append(event_type)
        if device and device != 'ALL':
            where_clauses.append("f.DEVICE_TYPE = %s")
            params.append(device)
        if country and country != 'ALL':
            where_clauses.append("f.COUNTRY = %s")
            params.append(country)
            
        where_sql = " AND ".join(where_clauses)
        
        # One round trip: every dashboard panel comes from this single statement over the same filtered CTE.
        consolidated_sql = f"""
        WITH base_events AS (
            SELECT 
                f.EVENT_ID, 
                f.EVENT_HOUR, 
                f.USER_ID, 
                f.SONG_ID, 
                s.SONG_NAME, 
                s.ARTIST_NAME, 
                f.EVENT_TYPE, 
                f.DEVICE_TYPE, 
                f.COUNTRY
            FROM {GOLD}.FCT_LISTENING_EVENTS f
            INNER JOIN {GOLD}.DIM_SONGS s ON f.SONG_ID = s.SONG_ID
            WHERE {where_sql}
        ),
        total_scope AS (
            SELECT COUNT(*) AS total_available FROM {GOLD}.FCT_LISTENING_EVENTS
        )
        SELECT
            OBJECT_CONSTRUCT(
                'total_events', (SELECT COUNT(*) FROM base_events),
                'unique_users', (SELECT COUNT(DISTINCT USER_ID) FROM base_events),
                'unique_songs', (SELECT COUNT(DISTINCT SONG_ID) FROM base_events),
                'unique_artists', (SELECT COUNT(DISTINCT ARTIST_NAME) FROM base_events),
                'total_available_events', (SELECT total_available FROM total_scope)
            ) AS kpis,
            (SELECT ARRAY_AGG(OBJECT_CONSTRUCT('hour', EVENT_HOUR, 'events', cnt, 'users', usr_cnt)) WITHIN GROUP (ORDER BY EVENT_HOUR ASC)
             FROM (SELECT EVENT_HOUR, COUNT(*) AS cnt, COUNT(DISTINCT USER_ID) AS usr_cnt FROM base_events GROUP BY EVENT_HOUR)) AS timeline,
            (SELECT ARRAY_AGG(OBJECT_CONSTRUCT('song_name', SONG_NAME, 'artist_name', ARTIST_NAME, 'event_count', cnt, 'distinct_users', usr_cnt)) WITHIN GROUP (ORDER BY cnt DESC, SONG_NAME ASC)
             FROM (SELECT SONG_NAME, ARTIST_NAME, COUNT(*) AS cnt, COUNT(DISTINCT USER_ID) AS usr_cnt FROM base_events GROUP BY SONG_NAME, ARTIST_NAME ORDER BY cnt DESC, SONG_NAME ASC LIMIT 10)) AS top_songs,
            (SELECT ARRAY_AGG(OBJECT_CONSTRUCT('artist_name', ARTIST_NAME, 'event_count', cnt, 'distinct_songs', song_cnt, 'distinct_users', usr_cnt)) WITHIN GROUP (ORDER BY cnt DESC, ARTIST_NAME ASC)
             FROM (SELECT ARTIST_NAME, COUNT(*) AS cnt, COUNT(DISTINCT SONG_ID) AS song_cnt, COUNT(DISTINCT USER_ID) AS usr_cnt FROM base_events GROUP BY ARTIST_NAME ORDER BY cnt DESC, ARTIST_NAME ASC LIMIT 10)) AS top_artists,
            (SELECT ARRAY_AGG(OBJECT_CONSTRUCT('type', EVENT_TYPE, 'count', cnt)) WITHIN GROUP (ORDER BY cnt DESC)
             FROM (SELECT EVENT_TYPE, COUNT(*) AS cnt FROM base_events GROUP BY EVENT_TYPE ORDER BY cnt DESC)) AS event_dist,
            (SELECT ARRAY_AGG(OBJECT_CONSTRUCT('device', DEVICE_TYPE, 'count', cnt)) WITHIN GROUP (ORDER BY cnt DESC)
             FROM (SELECT DEVICE_TYPE, COUNT(*) AS cnt FROM base_events GROUP BY DEVICE_TYPE ORDER BY cnt DESC)) AS device_dist,
            (SELECT ARRAY_AGG(OBJECT_CONSTRUCT('country', COUNTRY, 'count', cnt, 'users', usr_cnt)) WITHIN GROUP (ORDER BY cnt DESC)
             FROM (SELECT COUNTRY, COUNT(*) AS cnt, COUNT(DISTINCT USER_ID) AS usr_cnt FROM base_events GROUP BY COUNTRY ORDER BY cnt DESC)) AS country_dist,
            (SELECT TO_VARCHAR(MAX(LAST_ALTERED), 'YYYY-MM-DD HH24:MI:SS UTC')
             FROM {DATABASE}.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='{GOLD_SCHEMA}' AND TABLE_NAME='FCT_LISTENING_EVENTS') AS last_sync_timestamp,
            (SELECT OBJECT_CONSTRUCT(
                'actions', (SELECT OBJECT_AGG(EVENT_TYPE, cnt) FROM (SELECT EVENT_TYPE, COUNT(*) as cnt FROM {GOLD}.FCT_LISTENING_EVENTS GROUP BY EVENT_TYPE)),
                'devices', (SELECT OBJECT_AGG(DEVICE_TYPE, cnt) FROM (SELECT DEVICE_TYPE, COUNT(*) as cnt FROM {GOLD}.FCT_LISTENING_EVENTS GROUP BY DEVICE_TYPE)),
                'countries', (SELECT OBJECT_AGG(COUNTRY, cnt) FROM (SELECT COUNTRY, COUNT(*) as cnt FROM {GOLD}.FCT_LISTENING_EVENTS GROUP BY COUNTRY))
            )) AS dataset_totals;
        """
        
        cur.execute(consolidated_sql, params)
        row = cur.fetchone()
        
        def parse_col(val, default):
            if val is None:
                return default
            if isinstance(val, (dict, list)):
                return val
            if isinstance(val, str):
                try:
                    return json.loads(val)
                except Exception:
                    return default
            return default
            
        kpis = parse_col(row[0], {"total_events": 0, "unique_users": 0, "unique_songs": 0, "unique_artists": 0, "total_available_events": 0})
        timeline = parse_col(row[1], [])
        top_songs = parse_col(row[2], [])
        top_artists = parse_col(row[3], [])
        event_dist = parse_col(row[4], [])
        device_dist = parse_col(row[5], [])
        country_dist = parse_col(row[6], [])
        last_sync = str(row[7]) if row[7] else None
        dataset_totals = parse_col(row[8], {"actions": {}, "devices": {}, "countries": {}})
        
        cur.close()
        conn.close()
        
        sorted_timeline = sorted(timeline or [], key=lambda t: t.get('hour', 0))
        
        return {
            "source": "live_snowflake",
            "kpis": kpis,
            "timeline": sorted_timeline,
            "top_songs": top_songs or [],
            "top_artists": top_artists or [],
            "event_distribution": event_dist or [],
            "device_distribution": device_dist or [],
            "country_distribution": country_dist or [],
            "dataset_totals": dataset_totals,
            "last_sync_timestamp": last_sync,
            "filters_applied": {
                "event_type": event_type or "ALL",
                "device": device or "ALL",
                "country": country or "ALL"
            }
        }, None
    except Exception as e:
        if conn:
            conn.close()
        return None, str(e)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-type", default="ALL")
    parser.add_argument("--device", default="ALL")
    parser.add_argument("--country", default="ALL")
    args = parser.parse_args()
    
    result, err = query_live_gold(args.event_type, args.device, args.country)
    if err:
        print(json.dumps({"error": err, "source": "failed"}), file=sys.stderr)
        sys.exit(1)
    print(json.dumps(result, default=json_default, indent=2))
