/*
    Test: assert_silver_staging_reconciliation
    Validates cross-layer consistency:
    The row count in silver_spotify_events must exactly equal the count of distinct
    valid event_ids in stg_spotify_events (where is_valid_record = TRUE).
    Fails if there is any mismatch between staging and Silver.
*/

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
