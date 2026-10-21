{{
    config(
        materialized='view',
        schema='silver'
    )
}}

/*
    Monitoring View: silver_data_quality_metrics
    - Aggregates operational data quality health metrics across Bronze, Staging, and Silver.
    - Provides immediate visibility into error rates, validity percentages, and anomaly indicators.
    - Designed for ingestion monitoring dashboards and data SLA alerting.
*/

WITH staging_metrics AS (
    SELECT
        COUNT(*)                                                    AS total_staged_records,
        COUNT(DISTINCT event_id)                                    AS distinct_event_ids,
        COUNT_IF(is_valid_record = TRUE)                            AS valid_record_count,
        COUNT_IF(is_valid_record = FALSE)                           AS quarantined_record_count,
        COUNT_IF(is_duplicate_id = TRUE)                            AS duplicate_instance_count,
        COUNT_IF(is_conflicting_id = TRUE)                          AS conflicting_id_count,

        -- Granular Failure Category Counts
        COUNT_IF(is_valid_event_id = FALSE)                         AS missing_event_id_count,
        COUNT_IF(is_valid_timestamp = FALSE)                        AS invalid_timestamp_count,
        COUNT_IF(is_valid_event_type = FALSE)                       AS invalid_event_type_count,
        COUNT_IF(is_valid_device_type = FALSE)                      AS invalid_device_type_count,
        COUNT_IF(is_valid_country = FALSE)                          AS invalid_country_format_count,
        COUNT_IF(is_valid_attributes = FALSE)                       AS missing_attribute_count,

        ROUND(
            COUNT_IF(is_valid_record = TRUE) * 100.0 / NULLIF(COUNT(*), 0),
            2
        )                                                           AS data_quality_pass_rate_pct
    FROM {{ ref('stg_spotify_events') }}
),

silver_metrics AS (
    SELECT
        COUNT(*) AS silver_canonical_records
    FROM {{ ref('silver_spotify_events') }}
)

SELECT
    s.total_staged_records,
    s.distinct_event_ids,
    s.valid_record_count,
    s.quarantined_record_count,
    m.silver_canonical_records,
    s.duplicate_instance_count,
    s.conflicting_id_count,
    s.missing_event_id_count,
    s.invalid_timestamp_count,
    s.invalid_event_type_count,
    s.invalid_device_type_count,
    s.invalid_country_format_count,
    s.missing_attribute_count,
    s.data_quality_pass_rate_pct,
    CURRENT_TIMESTAMP()                                             AS evaluated_at
FROM staging_metrics s
CROSS JOIN silver_metrics m
