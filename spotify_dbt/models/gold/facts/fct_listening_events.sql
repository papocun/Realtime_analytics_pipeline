{{
    config(
        materialized='table',
        schema='gold'
    )
}}

-- Grain: one row per Silver event. No dimension joins, so the fact can never fan out.

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
