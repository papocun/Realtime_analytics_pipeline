{{
    config(
        materialized='table',
        schema='silver'
    )
}}

/*
    Silver Spotify Events:
    - Cleaned, validated, and deduplicated event stream.
    - Exactly one canonical record per verified, conflict-free EVENT_ID.
    - Ingestion contract:
        * Invalid records (bad IDs, unparseable timestamps, invalid types, attribute nulls) are excluded.
        * Conflicting records (same event_id, different payloads) are quarantined.
        * Only records where is_valid_record = TRUE (issue_count == 0) qualify.
    - Deduplication: PARTITION BY event_id ORDER BY event_timestamp DESC, user_id ASC, song_id ASC.
*/

WITH clean_staged_events AS (
    SELECT
        event_id,
        user_id,
        song_id,
        artist_name,
        song_name,
        event_type,
        device_type,
        country,
        event_timestamp,
        raw_occurrence_count
    FROM {{ ref('stg_spotify_events') }}
    WHERE is_valid_record = TRUE
),

deduplicated AS (
    SELECT
        event_id,
        user_id,
        song_id,
        artist_name,
        song_name,
        event_type,
        device_type,
        country,
        event_timestamp,
        raw_occurrence_count,
        ROW_NUMBER() OVER (
            PARTITION BY event_id
            ORDER BY event_timestamp DESC, user_id ASC, song_id ASC
        ) AS dedup_rank
    FROM clean_staged_events
)

SELECT
    event_id,
    user_id,
    song_id,
    artist_name,
    song_name,
    event_type,
    device_type,
    country,
    event_timestamp,
    raw_occurrence_count,
    CURRENT_TIMESTAMP() AS silver_inserted_at
FROM deduplicated
WHERE dedup_rank = 1
