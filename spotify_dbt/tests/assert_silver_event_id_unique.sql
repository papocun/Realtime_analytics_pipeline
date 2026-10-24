/*
    Test: assert_silver_event_id_unique
    Verifies that silver_spotify_events contains exactly one row per event_id.
    Fails if any duplicate event_id is found.
*/

SELECT
    event_id,
    COUNT(*) AS occurrence_count
FROM {{ ref('silver_spotify_events') }}
GROUP BY event_id
HAVING COUNT(*) > 1
