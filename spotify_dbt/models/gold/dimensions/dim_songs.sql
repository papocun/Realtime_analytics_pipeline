{{
    config(
        materialized='table',
        schema='gold'
    )
}}

-- Grain: one row per song_id; name and artist come from the latest observation if they ever drift.

with silver_events as (
    select
        song_id,
        song_name,
        artist_name,
        event_type,
        event_timestamp
    from {{ ref('silver_spotify_events') }}
    where song_id is not null
),

song_metadata as (
    select
        song_id,
        song_name,
        artist_name,
        row_number() over (
            partition by song_id 
            order by event_timestamp desc, song_name asc, artist_name asc
        ) as rn
    from silver_events
),

canonical_metadata as (
    select
        song_id,
        song_name,
        artist_name
    from song_metadata
    where rn = 1
),

song_activity as (
    select
        song_id,
        count(*) as total_events,
        count(case when event_type = 'play' then 1 end) as total_plays,
        min(case when event_type = 'play' then event_timestamp end) as first_played_at,
        max(case when event_type = 'play' then event_timestamp end) as last_played_at
    from silver_events
    group by song_id
)

select
    m.song_id,
    m.song_name,
    m.artist_name,
    coalesce(a.total_events, 0) as total_events,
    coalesce(a.total_plays, 0) as total_plays,
    a.first_played_at,
    a.last_played_at,
    current_timestamp() as gold_created_at
from canonical_metadata m
inner join song_activity a on m.song_id = a.song_id
