{{
    config(
        materialized='view',
        schema='silver'
    )
}}

-- Normalises Bronze and flags every quality rule per row; nothing is dropped here so Silver and quarantine stay reconcilable.

WITH source_data AS (
    SELECT
        "EVENT_ID"       AS event_id,
        "USER_ID"        AS user_id,
        "SONG_ID"        AS song_id,
        "ARTIST_NAME"    AS artist_name,
        "SONG_NAME"      AS song_name,
        "EVENT_TYPE"     AS event_type,
        "DEVICE_TYPE"    AS device_type,
        "COUNTRY"        AS country,
        "TIMESTAMP"      AS raw_event_timestamp
    FROM {{ source('bronze', 'spotify_events_bronze') }}
),

cleaned AS (
    SELECT
        TRIM(event_id)                            AS event_id,
        TRIM(user_id)                             AS user_id,
        TRIM(song_id)                             AS song_id,
        TRIM(artist_name)                         AS artist_name,
        TRIM(song_name)                           AS song_name,
        LOWER(TRIM(event_type))                   AS event_type,
        LOWER(TRIM(device_type))                  AS device_type,
        UPPER(TRIM(country))                      AS country,
        TRY_TO_TIMESTAMP_NTZ(raw_event_timestamp) AS event_timestamp,
        raw_event_timestamp                       AS raw_event_timestamp
    FROM source_data
),

payload_analysis AS (
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

        CASE
            WHEN event_id IS NOT NULL AND LENGTH(event_id) > 0 THEN TRUE
            ELSE FALSE
        END AS is_valid_event_id,

        CASE
            WHEN event_timestamp IS NOT NULL THEN TRUE
            ELSE FALSE
        END AS is_valid_timestamp,

        CASE
            WHEN event_type IN ('play', 'pause', 'skip', 'add_to_playlist') THEN TRUE
            ELSE FALSE
        END AS is_valid_event_type,

        CASE
            WHEN device_type IN ('mobile', 'desktop', 'web') THEN TRUE
            ELSE FALSE
        END AS is_valid_device_type,

        CASE
            WHEN country IN ('US', 'UK', 'CA', 'AU', 'IN', 'DE') THEN TRUE
            ELSE FALSE
        END AS is_valid_country,

        CASE
            WHEN user_id IS NOT NULL AND LENGTH(user_id) > 0
             AND song_id IS NOT NULL AND LENGTH(song_id) > 0
             AND artist_name IS NOT NULL AND LENGTH(artist_name) > 0
             AND song_name IS NOT NULL AND LENGTH(song_name) > 0
            THEN TRUE
            ELSE FALSE
        END AS is_valid_attributes,

        COUNT(*) OVER (
            PARTITION BY event_id
        ) AS raw_occurrence_count,

        COUNT(DISTINCT HASH(
            user_id, song_id, artist_name, song_name,
            event_type, device_type, country, raw_event_timestamp
        )) OVER (
            PARTITION BY event_id
        ) AS distinct_payload_count

    FROM cleaned
),

evaluated AS (
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
        is_valid_event_id,
        is_valid_timestamp,
        is_valid_event_type,
        is_valid_device_type,
        is_valid_country,
        is_valid_attributes,
        raw_occurrence_count,
        distinct_payload_count,

        CASE WHEN raw_occurrence_count > 1 THEN TRUE ELSE FALSE END AS is_duplicate_id,
        CASE WHEN distinct_payload_count > 1 THEN TRUE ELSE FALSE END AS is_conflicting_id,

        ARRAY_CONSTRUCT_COMPACT(
            CASE WHEN is_valid_event_id = FALSE THEN 'MISSING_EVENT_ID' END,
            CASE WHEN is_valid_timestamp = FALSE THEN 'INVALID_TIMESTAMP' END,
            CASE WHEN is_valid_event_type = FALSE THEN 'INVALID_EVENT_TYPE' END,
            CASE WHEN is_valid_device_type = FALSE THEN 'INVALID_DEVICE_TYPE' END,
            CASE WHEN is_valid_country = FALSE THEN 'INVALID_COUNTRY_FORMAT' END,
            CASE WHEN is_valid_attributes = FALSE THEN 'MISSING_REQUIRED_ATTRIBUTE' END,
            CASE WHEN distinct_payload_count > 1 THEN 'CONFLICTING_EVENT_ID' END
        ) AS quality_issues,

        CURRENT_TIMESTAMP() AS staged_at
    FROM payload_analysis
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
    raw_event_timestamp,
    is_valid_event_id,
    is_valid_timestamp,
    is_valid_event_type,
    is_valid_device_type,
    is_valid_country,
    is_valid_attributes,
    raw_occurrence_count,
    distinct_payload_count,
    is_duplicate_id,
    is_conflicting_id,
    quality_issues,
    ARRAY_TO_STRING(quality_issues, ', ') AS failure_reasons,
    ARRAY_SIZE(quality_issues) AS issue_count,
    CASE WHEN ARRAY_SIZE(quality_issues) = 0 THEN TRUE ELSE FALSE END AS is_valid_record,
    staged_at
FROM evaluated
