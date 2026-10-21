{{
    config(
        materialized='view',
        schema='silver'
    )
}}

/*
    Monitoring View: silver_quarantine_summary
    - Flattens the array of quality issues on quarantined rows to compute
      summary frequencies by specific failure reason code.
    - Yields zero rows when all records are valid; expands to actionable counts
      when defects occur.
*/

SELECT
    reason.value::string            AS failure_reason,
    COUNT(*)                        AS affected_record_count,
    COUNT(DISTINCT event_id)        AS distinct_event_count,
    CURRENT_TIMESTAMP()             AS evaluated_at
FROM {{ ref('quarantine_spotify_events') }},
LATERAL FLATTEN(input => quality_issues) reason
GROUP BY reason.value::string
ORDER BY affected_record_count DESC
