/*
    Singular Test: assert_gold_aggregates_match_fact
    Objective: Validates aggregate consistency between fct_listening_events and the pre-aggregated Gold summary tables.
    Pass condition: All aggregate totals match the underlying fact table totals exactly (returns 0 rows).
*/

with fact_totals as (
    select
        count(*) as fact_total_events,
        count(case when is_play then 1 end) as fact_play_events
    from {{ ref('fct_listening_events') }}
),

daily_totals as (
    select
        coalesce(sum(total_events), 0) as daily_total_events,
        coalesce(sum(play_events), 0) as daily_play_events
    from {{ ref('agg_daily_activity') }}
),

song_totals as (
    select
        coalesce(sum(play_events), 0) as song_play_events
    from {{ ref('agg_song_rankings') }}
),

country_totals as (
    select
        coalesce(sum(total_events), 0) as country_total_events
    from {{ ref('agg_country_activity') }}
),

device_totals as (
    select
        coalesce(sum(total_events), 0) as device_total_events
    from {{ ref('agg_device_distribution') }}
)

select
    f.fact_total_events,
    d.daily_total_events,
    f.fact_play_events,
    d.daily_play_events,
    s.song_play_events,
    c.country_total_events,
    dev.device_total_events
from fact_totals f
cross join daily_totals d
cross join song_totals s
cross join country_totals c
cross join device_totals dev
where f.fact_total_events != d.daily_total_events
   or f.fact_play_events != d.daily_play_events
   or f.fact_play_events != s.song_play_events
   or f.fact_total_events != c.country_total_events
   or f.fact_total_events != dev.device_total_events
