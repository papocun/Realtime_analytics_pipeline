{{
    config(
        materialized='table',
        schema='gold'
    )
}}

select
    coalesce(country, 'UNKNOWN') as country,
    count(*) as total_events,
    count(case when is_play then 1 end) as play_events,
    count(case when is_skip then 1 end) as skip_events,
    count(distinct case when is_play then user_id end) as distinct_listeners,
    count(distinct case when is_play then song_id end) as distinct_songs,
    round(
        100.0 * count(*) / sum(count(*)) over (),
        2
    ) as event_share_pct,
    current_timestamp() as gold_created_at
from {{ ref('fct_listening_events') }}
group by coalesce(country, 'UNKNOWN')
