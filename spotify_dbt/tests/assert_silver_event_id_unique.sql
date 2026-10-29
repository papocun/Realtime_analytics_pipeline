SELECT
    event_id,
    COUNT(*) AS occurrence_count
FROM {{ ref('silver_spotify_events') }}
GROUP BY event_id
HAVING COUNT(*) > 1
