{{
    config(
        materialized='table',
        schema='gold'
    )
}}

-- Grain: one row per UTC calendar day, spanning the first to the last event date.

with bounds as (
    select
        min(cast(event_timestamp as date)) as start_date,
        max(cast(event_timestamp as date)) as end_date
    from {{ ref('silver_spotify_events') }}
),

date_spine as (
    select dateadd(day, row_number() over (order by seq4()) - 1, bounds.start_date) as date_day
    from bounds, table(generator(rowcount => 3660))
    qualify date_day <= bounds.end_date
)

select
    date_day,
    extract(year from date_day) as year,
    extract(quarter from date_day) as quarter,
    extract(month from date_day) as month,
    monthname(date_day) as month_name,
    extract(day from date_day) as day_of_month,
    dayofweek(date_day) as day_of_week,
    dayname(date_day) as day_name,
    extract(week from date_day) as week_of_year,
    case 
        when dayname(date_day) in ('Sat', 'Sun') then true 
        else false 
    end as is_weekend,
    current_timestamp() as gold_created_at
from date_spine
order by date_day
