import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

export interface FilterParams {
  eventType?: string;
  device?: string;
  country?: string;
  bypassCache?: boolean;
}

export interface KpiData {
  total_events: number;
  total_available_events?: number;
  unique_users: number;
  unique_songs: number;
  unique_artists: number;
}

export interface TimelinePoint {
  hour: number;
  events: number;
  users?: number;
}

export interface TopSong {
  song_name: string;
  artist_name: string;
  event_count: number;
  distinct_users: number;
}

export interface TopArtist {
  artist_name: string;
  event_count: number;
  distinct_songs: number;
  distinct_users: number;
}

export interface EventDistItem {
  type: string;
  count: number;
}

export interface DeviceDistItem {
  device: string;
  count: number;
}

export interface CountryDistItem {
  country: string;
  count: number;
  users: number;
}

export interface DatasetTotals {
  actions: Record<string, number>;
  devices: Record<string, number>;
  countries: Record<string, number>;
}

export interface DashboardData {
  source: 'live_snowflake' | 'verified_gold_snapshot';
  kpis: KpiData;
  timeline: TimelinePoint[];
  top_songs: TopSong[];
  top_artists: TopArtist[];
  event_distribution: EventDistItem[];
  device_distribution: DeviceDistItem[];
  country_distribution: CountryDistItem[];
  dataset_totals?: DatasetTotals;
  last_sync_timestamp: string | null;
  filters_applied: {
    event_type: string;
    device: string;
    country: string;
  };
}

const ALLOWED = {
  eventType: new Set(['ALL', 'play', 'pause', 'skip', 'add_to_playlist']),
  device: new Set(['ALL', 'desktop', 'mobile', 'web']),
  country: new Set(['ALL', 'US', 'UK', 'CA', 'AU', 'IN', 'DE']),
};

const CACHE_TTL_MS = 60 * 1000;
const serverCache = new Map<string, { data: DashboardData; timestamp: number }>();

export async function fetchDashboardData(filters: FilterParams = {}): Promise<DashboardData> {
  const eventType = filters.eventType || 'ALL';
  const device = filters.device || 'ALL';
  const country = filters.country || 'ALL';

  // Only known values reach Python and the cache, so arbitrary query strings cannot grow the cache.
  if (!ALLOWED.eventType.has(eventType) || !ALLOWED.device.has(device) || !ALLOWED.country.has(country)) {
    throw new InvalidFilterError('Unsupported filter value');
  }

  const cacheKey = `${eventType}__${device}__${country}`;
  const cached = serverCache.get(cacheKey);
  if (!filters.bypassCache && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const scriptPath = path.resolve(process.cwd(), 'src/lib/query_gold_api.py');
  const projectRoot = path.resolve(process.cwd(), '..');

  try {
    const { stdout } = await execFileAsync(
      'uv',
      ['run', 'python', scriptPath, '--event-type', eventType, '--device', device, '--country', country],
      { cwd: projectRoot, timeout: 25000, env: { ...process.env, PYTHONUNBUFFERED: '1' } },
    );
    const parsed = JSON.parse(stdout) as DashboardData;
    serverCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
    return parsed;
  } catch (err: unknown) {
    console.warn('Live Snowflake query failed, serving the saved Gold snapshot:', err);
    return loadSnapshot(eventType, device, country);
  }
}

export class InvalidFilterError extends Error {}

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

// The snapshot holds pre-aggregated Gold tables, so only the action filter can be applied;
// device and country filters cannot narrow it, and the UI warns about that.
function loadSnapshot(eventType: string, device: string, country: string): DashboardData {
  const snapshotPath = path.resolve(process.cwd(), 'src/data/gold_analytics.json');
  if (!fs.existsSync(snapshotPath)) {
    throw new Error('Could not retrieve data from Snowflake or the saved snapshot');
  }
  const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const summary: Row = raw.summary ?? {};
  const actionCol = eventType === 'ALL' ? 'total_events' : `${eventType}_events`;
  const actions = ['play', 'pause', 'skip', 'add_to_playlist'];

  const actionTotals = Object.fromEntries(actions.map((a) => [a, num(summary[`${a}_events`])]));
  const devices: Row[] = raw.device_distribution ?? [];
  const countries: Row[] = raw.country_activity ?? [];
  const songs: Row[] = raw.song_rankings ?? [];
  const artists: Row[] = raw.artist_rankings ?? [];

  const songValue = (s: Row) =>
    eventType === 'ALL' ? num(s.total_events) : eventType === 'play' ? num(s.play_events) : eventType === 'skip' ? num(s.total_skips) : NaN;
  const artistValue = (a: Row) =>
    eventType === 'ALL' ? num(a.total_events) : eventType === 'play' ? num(a.play_events) : eventType === 'skip' ? num(a.skip_events) : NaN;

  return {
    source: 'verified_gold_snapshot',
    kpis: {
      total_events: num(summary[actionCol]),
      total_available_events: num(summary.total_events),
      unique_users: num(eventType === 'play' ? summary.distinct_listeners : summary.total_active_users),
      unique_songs: num(summary.distinct_songs_played),
      unique_artists: new Set(artists.map((a) => a.artist_name)).size,
    },
    timeline: (raw.hourly_activity ?? []).map((h: Row) => ({ hour: num(h.event_hour), events: num(h[actionCol]) })),
    top_songs: songs
      .filter((s) => !Number.isNaN(songValue(s)))
      .map((s) => ({
        song_name: String(s.song_name),
        artist_name: String(s.artist_name),
        event_count: songValue(s),
        distinct_users: num(s.distinct_listeners),
      }))
      .sort((a, b) => b.event_count - a.event_count),
    top_artists: artists
      .filter((a) => !Number.isNaN(artistValue(a)))
      .map((a) => ({
        artist_name: String(a.artist_name),
        event_count: artistValue(a),
        distinct_songs: num(a.distinct_songs),
        distinct_users: num(a.distinct_listeners),
      }))
      .sort((a, b) => b.event_count - a.event_count),
    event_distribution: actions
      .filter((a) => eventType === 'ALL' || a === eventType)
      .map((a) => ({ type: a, count: actionTotals[a] }))
      .sort((a, b) => b.count - a.count),
    device_distribution: devices.map((d) => ({ device: String(d.device_type), count: num(d.total_events) })),
    country_distribution: countries.map((c) => ({
      country: String(c.country),
      count: num(c.total_events),
      users: num(c.distinct_listeners),
    })),
    dataset_totals: {
      actions: actionTotals,
      devices: Object.fromEntries(devices.map((d) => [String(d.device_type), num(d.total_events)])),
      countries: Object.fromEntries(countries.map((c) => [String(c.country), num(c.total_events)])),
    },
    last_sync_timestamp: raw.data_quality?.last_sync_timestamp ?? null,
    filters_applied: { event_type: eventType, device, country },
  };
}
