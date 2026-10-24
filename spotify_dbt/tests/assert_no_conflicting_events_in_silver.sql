/*
    Test: assert_no_conflicting_events_in_silver
    Verifies that no event_id that had conflicting payloads in Bronze/staging
    ever enters silver_spotify_events.
    Fails if any row in silver_spotify_events corresponds to a conflicting event_id.
*/

SELECT
    s.event_id
FROM {{ ref('silver_spotify_events') }} s
JOIN {{ ref('stg_spotify_events') }} stg
  ON s.event_id = stg.event_id
WHERE stg.is_conflicting_id = TRUE
