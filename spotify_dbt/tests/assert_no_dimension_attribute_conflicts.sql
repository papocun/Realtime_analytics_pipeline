select
    song_id,
    count(distinct song_name) as distinct_names,
    count(distinct artist_name) as distinct_artists
from {{ ref('dim_songs') }}
group by song_id
having count(distinct song_name) > 1 or count(distinct artist_name) > 1
