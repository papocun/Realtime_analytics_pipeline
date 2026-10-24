/*
    Singular Test: assert_no_dimension_attribute_conflicts
    Objective: Validates that every song_id in dim_songs has exactly one distinct song_name and artist_name.
    Pass condition: Returns 0 rows.
*/

select
    song_id,
    count(distinct song_name) as distinct_names,
    count(distinct artist_name) as distinct_artists
from {{ ref('dim_songs') }}
group by song_id
having count(distinct song_name) > 1 or count(distinct artist_name) > 1
