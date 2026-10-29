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
