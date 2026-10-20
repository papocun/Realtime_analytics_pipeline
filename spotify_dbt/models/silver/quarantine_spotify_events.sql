{{
    config(
        materialized='view',
        schema='silver'
    )
}}

/*
    Quarantine Spotify Events:
    - Exposes invalid, malformed, or conflicting records excluded from Silver.
    - Preserves all failure reason codes as both an ARRAY (quality_issues)
      and a comma-separated string (failure_reasons).
    - Preserves unparseable raw timestamps, missing IDs, and conflicting attributes
      to facilitate engineering triage and root-cause analysis.
*/

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
