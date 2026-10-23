{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Aggregate: agg_daily_activity
    Grain: Exactly one row per event_date.
    Source: ref('fct_listening_events')
    
    Metric Semantics:
    - total_events: Count of all valid canonical events on this date.
    - play_events: Count of events with event_type = 'play'.
    - skip_events: Count of events with event_type = 'skip'.
    - distinct_listeners: Count of unique user_id values with at least one play event.
    - distinct_songs_played: Count of unique song_id values with at least one play event.
    - skip_rate_pct: Percentage of skips relative to total active engagements (play + skip).
*/

select
    event_date,
    count(*) as total_events,
    count(case when is_play then 1 end) as play_events,
    count(case when is_skip then 1 end) as skip_events,
    count(case when is_pause then 1 end) as pause_events,
    count(case when is_add_to_playlist then 1 end) as add_to_playlist_events,
    count(distinct case when is_play then user_id end) as distinct_listeners,
    count(distinct case when is_play then song_id end) as distinct_songs_played,
    round(
        100.0 * count(case when is_skip then 1 end) / 
        nullif(count(case when is_play then 1 end) + count(case when is_skip then 1 end), 0),
        2
    ) as skip_rate_pct,
    current_timestamp() as gold_created_at
from {{ ref('fct_listening_events') }}
group by event_date
