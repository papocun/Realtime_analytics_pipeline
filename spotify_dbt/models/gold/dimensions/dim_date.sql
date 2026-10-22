{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Dimension: dim_date
    Grain: Exactly one row per calendar date.
    Range: Generates a complete calendar spine for the operational reporting period (October 2026).
    Timezone semantics: UTC calendar dates aligning with event_timestamp dates.
*/

with date_spine as (
    select
        dateadd(day, seq4(), '2026-10-01'::date) as date_day
    from table(generator(rowcount => 31))
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
