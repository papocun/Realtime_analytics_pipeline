{{
    config(
        materialized='table',
        schema='gold'
    )
}}

-- Grain: one row per user_id. Device and country change between events, so they live on the fact, not here.

with silver_events as (
    select
        user_id,
        song_id,
        event_type,
        event_timestamp
    from {{ ref('silver_spotify_events') }}
    where user_id is not null
)

select
    user_id,
    min(event_timestamp) as first_active_at,
    max(event_timestamp) as last_active_at,
    count(*) as total_events,
    count(case when event_type = 'play' then 1 end) as play_events,
    count(distinct song_id) as distinct_songs_played,
    current_timestamp() as gold_created_at
from silver_events
group by user_id
