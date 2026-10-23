{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Fact Model: fct_listening_events
    Grain: Exactly one row per valid canonical event (1:1 with silver_spotify_events).
    Source: ref('silver_spotify_events')
    
    Relationships:
    - user_id references dim_users.user_id
    - song_id references dim_songs.song_id
    - event_date references dim_date.date_day
    
    Fanout Prevention:
    Zero outer/dimension joins are used in the core fact extraction, ensuring exactly
    610 fact records matching 610 verified Silver records.
*/

select
    event_id,
    event_timestamp,
    cast(event_timestamp as date) as event_date,
    extract(hour from event_timestamp) as event_hour,
    user_id,
    song_id,
    event_type,
    device_type,
    country,
    case when event_type = 'play' then true else false end as is_play,
    case when event_type = 'skip' then true else false end as is_skip,
    case when event_type = 'pause' then true else false end as is_pause,
    case when event_type = 'add_to_playlist' then true else false end as is_add_to_playlist,
    current_timestamp() as gold_created_at
from {{ ref('silver_spotify_events') }}
