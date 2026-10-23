{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Aggregate: agg_song_rankings
    Grain: Exactly one row per song_id.
    Source: ref('fct_listening_events'), ref('dim_songs')
    
    Ranking Semantics:
    Ranked strictly by play_events descending, break ties by distinct_listeners descending, then song_name ascending.
    Skip Rate Semantics: Skips relative to total play and skip interactions for the song.
*/

with song_activity as (
    select
        f.song_id,
        count(*) as total_events,
        count(case when f.is_play then 1 end) as play_events,
        count(case when f.is_skip then 1 end) as total_skips,
        count(distinct case when f.is_play then f.user_id end) as distinct_listeners
    from {{ ref('fct_listening_events') }} f
    group by f.song_id
)

select
    s.song_id,
    s.song_name,
    s.artist_name,
    dense_rank() over (
        order by coalesce(a.play_events, 0) desc, coalesce(a.distinct_listeners, 0) desc, s.song_name asc
    ) as play_rank,
    coalesce(a.play_events, 0) as play_events,
    coalesce(a.total_skips, 0) as total_skips,
    coalesce(a.distinct_listeners, 0) as distinct_listeners,
    coalesce(a.total_events, 0) as total_events,
    round(
        100.0 * coalesce(a.total_skips, 0) / 
        nullif(coalesce(a.play_events, 0) + coalesce(a.total_skips, 0), 0),
        2
    ) as skip_rate_pct,
    current_timestamp() as gold_created_at
from {{ ref('dim_songs') }} s
left join song_activity a on s.song_id = a.song_id
