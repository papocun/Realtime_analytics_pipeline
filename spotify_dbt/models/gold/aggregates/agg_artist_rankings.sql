{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Aggregate: agg_artist_rankings
    Grain: Exactly one row per artist_name.
    Source: ref('fct_listening_events'), ref('dim_songs')
    
    Ranking Semantics:
    Ranked by total play_events descending, distinct_listeners descending, then artist_name ascending.
*/

with artist_plays as (
    select
        s.artist_name,
        count(*) as total_events,
        count(case when f.is_play then 1 end) as play_events,
        count(case when f.is_skip then 1 end) as skip_events,
        count(distinct f.song_id) as distinct_songs,
        count(distinct case when f.is_play then f.user_id end) as distinct_listeners
    from {{ ref('fct_listening_events') }} f
    inner join {{ ref('dim_songs') }} s on f.song_id = s.song_id
    group by s.artist_name
)

select
    artist_name,
    dense_rank() over (
        order by play_events desc, distinct_listeners desc, artist_name asc
    ) as artist_rank,
    play_events,
    skip_events,
    distinct_songs,
    distinct_listeners,
    total_events,
    round(
        100.0 * skip_events / nullif(play_events + skip_events, 0),
        2
    ) as skip_rate_pct,
    current_timestamp() as gold_created_at
from artist_plays
