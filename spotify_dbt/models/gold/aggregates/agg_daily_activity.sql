{{
    config(
        materialized='table',
        schema='gold'
    )
}}

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
