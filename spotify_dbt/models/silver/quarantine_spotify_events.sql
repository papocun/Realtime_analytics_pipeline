{{
    config(
        materialized='view',
        schema='silver'
    )
}}

-- Every row excluded from Silver, with all failure reasons kept for triage.

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
    raw_event_timestamp,
    is_conflicting_id,
    is_duplicate_id,
    raw_occurrence_count,
    distinct_payload_count,
    quality_issues,
    failure_reasons,
    issue_count,
    staged_at
FROM {{ ref('stg_spotify_events') }}
WHERE is_valid_record = FALSE
