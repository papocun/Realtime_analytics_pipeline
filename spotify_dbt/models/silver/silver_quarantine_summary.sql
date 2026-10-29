{{
    config(
        materialized='view',
        schema='silver'
    )
}}

SELECT
    reason.value::string            AS failure_reason,
    COUNT(*)                        AS affected_record_count,
    COUNT(DISTINCT event_id)        AS distinct_event_count,
    CURRENT_TIMESTAMP()             AS evaluated_at
FROM {{ ref('quarantine_spotify_events') }},
LATERAL FLATTEN(input => quality_issues) reason
GROUP BY reason.value::string
ORDER BY affected_record_count DESC
