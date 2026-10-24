/*
    Singular Test: assert_gold_fact_matches_silver_count
    Objective: Validates that the Gold fact table maintains exact 1:1 grain with the clean Silver layer.
    Pass condition: Difference in row counts is zero (returns 0 rows).
*/

with silver_count as (
    select count(*) as cnt from {{ ref('silver_spotify_events') }}
),
gold_count as (
    select count(*) as cnt from {{ ref('fct_listening_events') }}
)

select
    s.cnt as silver_rows,
    g.cnt as gold_rows,
    abs(s.cnt - g.cnt) as diff
from silver_count s
cross join gold_count g
where s.cnt != g.cnt
