{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Dimension: dim_users
    Grain: Exactly one row per valid user_id.
    Source: ref('silver_spotify_events')
    
    Attribute Rule:
    Phase 1 empirical analysis proved that users dynamically change devices (desktop, mobile, web)
    and countries (up to 6 different countries per user within 1 hour).
    Therefore, country and device are transient event-level context attributes placed strictly
    in fct_listening_events, NOT permanent user dimension attributes.
*/

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
