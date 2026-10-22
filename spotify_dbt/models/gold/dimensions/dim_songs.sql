{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Dimension: dim_songs
    Grain: Exactly one row per valid song_id.
    Source: ref('silver_spotify_events')
    
    Attribute Resolution Rule:
    Phase 1 empirical analysis confirmed a strict 1:1 relationship between song_id,
    song_name, and artist_name across all verified records (0 conflicts).
    To safeguard against future conflicting upstream data, we select the canonical
    song_name and artist_name via the latest observed timestamp per song_id.
*/

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
