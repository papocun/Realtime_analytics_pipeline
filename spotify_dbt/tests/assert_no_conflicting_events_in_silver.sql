SELECT
    s.event_id
FROM {{ ref('silver_spotify_events') }} s
JOIN {{ ref('stg_spotify_events') }} stg
  ON s.event_id = stg.event_id
WHERE stg.is_conflicting_id = TRUE
