export interface SummaryKPIs {
  total_events: number;
  play_events: number;
  skip_events: number;
  pause_events: number;
  add_to_playlist_events: number;
  distinct_listeners: number;
  total_active_users: number;
  distinct_songs_played: number;
  overall_skip_rate_pct: number;
}

export interface DailyActivity {
  event_date: string;
  total_events: number;
  play_events: number;
  skip_events: number;
  pause_events: number;
  add_to_playlist_events: number;
  distinct_listeners: number;
  distinct_songs_played: number;
  skip_rate_pct: number;
  gold_created_at?: string;
}

export interface HourlyActivity {
  event_hour: number;
  total_events: number;
  play_events: number;
  skip_events: number;
  pause_events: number;
  add_to_playlist_events: number;
}

export interface SongRanking {
  song_id: string;
  song_name: string;
  artist_name: string;
  play_rank: number;
  play_events: number;
  total_skips: number;
  distinct_listeners: number;
  total_events: number;
  skip_rate_pct: number;
  gold_created_at?: string;
}

export interface ArtistRanking {
  artist_name: string;
  artist_rank: number;
  play_events: number;
  distinct_songs: number;
  distinct_listeners: number;
  skip_rate_pct: number;
  gold_created_at?: string;
}

export interface CountryActivity {
  country: string;
  total_events: number;
  play_events: number;
  distinct_listeners: number;
  event_share_pct: number;
  gold_created_at?: string;
}

export interface DeviceDistribution {
  device_type: string;
  total_events: number;
  play_events: number;
  device_share_pct: number;
  gold_created_at?: string;
}

export interface DataQualityMetrics {
  bronze_raw_rows: number;
  bronze_distinct_events: number;
  manifest_successful_files: number;
  silver_canonical_rows: number;
  silver_quarantined_rows: number;
  gold_fact_rows: number;
  deduplicated_rows: number;
  data_pass_rate_pct: number;
  dbt_tests_total: number;
  dbt_tests_passed: number;
  pytest_total: number;
  pytest_passed: number;
  models_count: number;
  last_sync_timestamp: string;
}

export interface AnalyticsResponse {
  summary: SummaryKPIs;
  daily_activity: DailyActivity[];
  hourly_activity: HourlyActivity[];
  song_rankings: SongRanking[];
  artist_rankings: ArtistRanking[];
  country_activity: CountryActivity[];
  device_distribution: DeviceDistribution[];
  data_quality: DataQualityMetrics;
  source: 'live_snowflake' | 'verified_gold_snapshot';
}
