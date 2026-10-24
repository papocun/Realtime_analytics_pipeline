/*
    Test: assert_silver_no_null_keys
    Verifies that no null or whitespace-only keys exist in silver_spotify_events.
    Fails if any row has missing event_id, user_id, or song_id.
*/

SELECT
    event_id,
    user_id,
    song_id
FROM {{ ref('silver_spotify_events') }}
WHERE event_id IS NULL OR TRIM(event_id) = ''
   OR user_id IS NULL OR TRIM(user_id) = ''
   OR song_id IS NULL OR TRIM(song_id) = ''
