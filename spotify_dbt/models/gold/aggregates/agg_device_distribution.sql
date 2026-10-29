{{
    config(
        materialized='table',
        schema='gold'
    )
}}

select
    coalesce(device_type, 'UNKNOWN') as device_type,
    count(*) as total_events,
    count(case when is_play then 1 end) as play_events,
    count(case when is_skip then 1 end) as skip_events,
    count(distinct user_id) as total_active_users,
    count(distinct case when is_play then user_id end) as distinct_listeners,
    round(
        100.0 * count(*) / sum(count(*)) over (),
        2
    ) as device_share_pct,
    current_timestamp() as gold_created_at
from {{ ref('fct_listening_events') }}
group by coalesce(device_type, 'UNKNOWN')
