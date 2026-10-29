{{
    config(
        materialized='table',
        schema='silver'
    )
}}

-- Grain: one row per valid, conflict-free event_id. Duplicates from at-least-once delivery collapse here.

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
