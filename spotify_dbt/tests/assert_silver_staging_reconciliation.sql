WITH staging_valid_events AS (
    SELECT
        COUNT(DISTINCT event_id) AS expected_silver_rows
    FROM {{ ref('stg_spotify_events') }}
    WHERE is_valid_record = TRUE
),

silver_actual_events AS (
    SELECT
        COUNT(*) AS actual_silver_rows
    FROM {{ ref('silver_spotify_events') }}
)

SELECT
    s.expected_silver_rows,
    a.actual_silver_rows
FROM staging_valid_events s
CROSS JOIN silver_actual_events a
WHERE s.expected_silver_rows != a.actual_silver_rows
