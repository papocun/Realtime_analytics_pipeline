'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  Clock3,
  Disc3,
  Headphones,
  Moon,
  RefreshCw,
  Repeat2,
  SkipForward,
  Sun,
  SunMoon,
  X,
  Activity,
  Database,
  CircleCheck,
} from 'lucide-react';
import { DashboardData } from '@/lib/data';
import { Card, ChartCard, EmptyState, Segmented } from '@/components/insights/ui';
import { HourlyChart, Sparkline } from '@/components/insights/HourlyChart';
import { ActionMix, CountryLollipop, DeviceWaffle } from '@/components/insights/Breakdowns';
import { RankedBars, RankedItem } from '@/components/insights/RankedBars';
import {
  ACTIONS,
  COUNTRY_NAMES,
  DEVICES,
  actionLabel,
  countryLabel,
  deviceLabel,
  fmt,
  friendlyTimestamp,
  hourLabel,
  pct,
} from '@/components/insights/format';

type ActionFilter = 'ALL' | 'play' | 'pause' | 'add_to_playlist' | 'skip';
type Theme = 'system' | 'light' | 'dark';

export default function ListeningInsightsPage() {
  const [action, setAction] = useState<ActionFilter>('ALL');
  const [device, setDevice] = useState('ALL');
  const [country, setCountry] = useState('ALL');
  const [rankView, setRankView] = useState<'songs' | 'artists'>('songs');

  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [checkedAt, setCheckedAt] = useState('');
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null);

  const requestKey = `${action}|${device}|${country}|${refreshToken}`;
  const isFetching = settled?.key !== requestKey;
  const error = !isFetching ? settled?.error ?? null : null;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (action !== 'ALL') params.set('event_type', action);
    if (device !== 'ALL') params.set('device', device);
    if (country !== 'ALL') params.set('country', country);
    if (refreshToken > 0) params.set('refresh', 'true');
    const key = `${action}|${device}|${country}|${refreshToken}`;

    // The previous numbers stay on screen (dimmed) while new ones load, so nothing jumps.
    fetch(`/api/analytics?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`The server answered with an error (${res.status}).`);
        const json: DashboardData = await res.json();
        setData(json);
        setCheckedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setSettled({ key, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({ key, error: err instanceof Error ? err.message : 'Something went wrong while loading data.' });
      });
    return () => controller.abort();
  }, [action, device, country, refreshToken]);

  const hasFilters = action !== 'ALL' || device !== 'ALL' || country !== 'ALL';
  const clearFilters = () => {
    setAction('ALL');
    setDevice('ALL');
    setCountry('ALL');
  };

  return (
    <div className="min-h-screen bg-[var(--page)] text-[var(--ink)]">
      <TopBar
        data={data}
        checkedAt={checkedAt}
        isFetching={isFetching}
        onRefresh={() => setRefreshToken((n) => n + 1)}
      />

      <main className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Listening insights</h1>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            When, what and how people listen. Built from every play, pause, save and skip in the streaming pipeline.
          </p>
        </div>

        <FilterBar
          data={data}
          action={action}
          device={device}
          country={country}
          setAction={setAction}
          setDevice={setDevice}
          setCountry={setCountry}
          hasFilters={hasFilters}
          clearFilters={clearFilters}
        />

        {error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--critical)]/40 bg-[var(--critical)]/10 px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--critical)]" />
              Couldn&apos;t load the latest numbers. {error}
            </span>
            <button
              type="button"
              onClick={() => setRefreshToken((n) => n + 1)}
              className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-hover)]"
            >
              Try again
            </button>
          </div>
        )}

        {data?.source === 'verified_gold_snapshot' && (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning-ink)]" />
            <div>
              <span className="font-medium">You&apos;re viewing a saved snapshot.</span>{' '}
              <span className="text-[var(--ink-2)]">
                The live warehouse didn&apos;t respond, so these numbers come from the last verified export.
                {hasFilters && ' Filters are only partly applied to saved data.'}
              </span>
            </div>
          </div>
        )}

        {!data && isFetching && <LoadingState />}

        {data && (
          <div className={`space-y-5 transition-opacity duration-200 ${isFetching ? 'opacity-60' : 'opacity-100'}`} aria-busy={isFetching}>
            <Takeaways data={data} />
            <KpiRow data={data} action={action} />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <ChartCard
                className="lg:col-span-8"
                title="When do people listen?"
                headline={peakHeadline(data)}
                table={{
                  columns: ['Hour (UTC)', 'Events', 'Listeners'],
                  rows: data.timeline.map((t) => [`${hourLabel(t.hour)} – ${hourLabel((t.hour + 1) % 24)}`, t.events, t.users ?? '—']),
                }}
                footer="Events per hour of the day, in UTC. Hover a column for details."
              >
                {data.timeline.length ? (
                  <HourlyChart timeline={data.timeline} totalEvents={data.kpis.total_events} />
                ) : (
                  <EmptyState message="No activity matches these filters." />
                )}
              </ChartCard>

              <ChartCard
                className="lg:col-span-4"
                title="What do listeners do?"
                headline={actionHeadline(data, action)}
                table={{
                  columns: ['Action', 'Events', 'Share'],
                  rows: data.event_distribution.map((e) => [actionLabel(e.type), e.count, pct(e.count, data.kpis.total_events, 1)]),
                }}
              >
                {data.event_distribution.length ? (
                  <ActionMix items={data.event_distribution} />
                ) : (
                  <EmptyState message="No actions match these filters." />
                )}
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <TopMusicCard data={data} view={rankView} setView={setRankView} />

              <ChartCard
                className="lg:col-span-5"
                title="Which devices do they use?"
                headline={deviceHeadline(data)}
                table={{
                  columns: ['Device', 'Events', 'Share'],
                  rows: data.device_distribution.map((d) => [deviceLabel(d.device), d.count, pct(d.count, data.kpis.total_events, 1)]),
                }}
              >
                {data.device_distribution.length ? (
                  <DeviceWaffle items={data.device_distribution} />
                ) : (
                  <EmptyState message="No device data for these filters." />
                )}
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <ChartCard
                className="lg:col-span-7"
                title="Where are they listening?"
                headline={countryHeadline(data)}
                table={{
                  columns: ['Country', 'Events', 'Listeners', 'Share'],
                  rows: [...data.country_distribution]
                    .sort((a, b) => b.count - a.count)
                    .map((c) => [countryLabel(c.country), c.count, c.users, pct(c.count, data.kpis.total_events, 1)]),
                }}
              >
                {data.country_distribution.length ? (
                  <CountryLollipop items={data.country_distribution} selected={country} onSelect={setCountry} />
                ) : (
                  <EmptyState message="No country data for these filters." />
                )}
              </ChartCard>

              <AboutDataCard data={data} checkedAt={checkedAt} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TopBar({
  data,
  checkedAt,
  isFetching,
  onRefresh,
}: {
  data: DashboardData | null;
  checkedAt: string;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const live = data?.source === 'live_snowflake';
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--on-accent)]">
            <Headphones className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold">Realtime Music Analytics</span>
        </div>

        <div className="flex items-center gap-2">
          {data && (
            <span
              className="hidden items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--ink-2)] md:inline-flex"
              title={live ? 'Numbers come straight from the data warehouse.' : 'The warehouse was unreachable, so a saved copy is shown.'}
            >
              {live ? (
                <CircleCheck className="h-3.5 w-3.5 text-[var(--good-ink)]" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning-ink)]" />
              )}
              {live ? 'Live data' : 'Saved snapshot'}
            </span>
          )}
          {data && (
            <span className="hidden items-center gap-1.5 text-xs text-[var(--ink-3)] lg:inline-flex">
              <Clock3 className="h-3.5 w-3.5" />
              Data updated {friendlyTimestamp(data.last_sync_timestamp)}
              {checkedAt && <span className="text-[var(--ink-3)]">· checked {checkedAt}</span>}
            </span>
          )}
          <ThemeToggle />
          <button
            type="button"
            onClick={onRefresh}
            disabled={isFetching}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-medium text-[var(--on-accent)] transition-opacity hover:opacity-90 disabled:opacity-60"
            title="Get the latest numbers from the warehouse"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isFetching ? "Updating…" : "Refresh"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

// The theme lives on <html data-theme>, set before first paint by the script in layout.tsx.
const themeListeners = new Set<() => void>();
const subscribeTheme = (cb: () => void) => {
  themeListeners.add(cb);
  return () => themeListeners.delete(cb);
};
const readTheme = (): Theme => {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'system';
};

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as Theme);

  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const labels: Record<Theme, string> = { system: 'Match system', light: 'Light', dark: 'Dark' };
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : SunMoon;

  const cycle = () => {
    const t = next[theme];
    const root = document.documentElement;
    if (t === 'system') delete root.dataset.theme;
    else root.dataset.theme = t;
    try {
      if (t === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', t);
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
    themeListeners.forEach((cb) => cb());
  };

  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink-2)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
      title={`Theme: ${labels[theme]} (click to change)`}
      aria-label={`Theme: ${labels[theme]}. Click to change.`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function FilterBar({
  data,
  action,
  device,
  country,
  setAction,
  setDevice,
  setCountry,
  hasFilters,
  clearFilters,
}: {
  data: DashboardData | null;
  action: ActionFilter;
  device: string;
  country: string;
  setAction: (v: ActionFilter) => void;
  setDevice: (v: string) => void;
  setCountry: (v: string) => void;
  hasFilters: boolean;
  clearFilters: () => void;
}) {
  const totalAll = data?.kpis.total_available_events ?? data?.kpis.total_events ?? 0;
  const shown = data?.kpis.total_events ?? 0;
  const totals = data?.dataset_totals;

  const selectClass =
    'h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--border-strong)] cursor-pointer';

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<ActionFilter>
          label="Filter by action"
          value={action}
          onChange={setAction}
          options={[{ value: 'ALL', label: 'All actions' }, ...ACTIONS.map((a) => ({ value: a.key as ActionFilter, label: a.label }))]}
        />
        <label className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
          Device
          <select value={device} onChange={(e) => setDevice(e.target.value)} className={selectClass}>
            <option value="ALL">All devices</option>
            {DEVICES.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
                {totals?.devices?.[d.key] ? ` (${fmt(totals.devices[d.key])})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
          Country
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectClass}>
            <option value="ALL">All countries</option>
            {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
                {totals?.countries?.[code] ? ` (${fmt(totals.countries[code])})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3 text-xs text-[var(--ink-2)]">
        {data && (
          <span className="tabular">
            {hasFilters ? (
              <>
                Showing <strong className="text-[var(--ink)]">{fmt(shown)}</strong> of {fmt(totalAll)} events ({pct(shown, totalAll)})
              </>
            ) : (
              <>
                Showing all <strong className="text-[var(--ink)]">{fmt(shown)}</strong> events
              </>
            )}
          </span>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-soft)]"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>
    </Card>
  );
}

function KpiRow({ data, action }: { data: DashboardData; action: ActionFilter }) {
  const { kpis } = data;
  const perListener = kpis.unique_users > 0 ? kpis.total_events / kpis.unique_users : 0;
  const plays = data.event_distribution.find((e) => e.type === 'play')?.count ?? 0;
  const skips = data.event_distribution.find((e) => e.type === 'skip')?.count ?? 0;
  const skipRateAvailable = action === 'ALL' && plays + skips > 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="min-w-0 p-5">
        <div className="flex items-center gap-2 text-[13px] text-[var(--ink-2)]">
          <Activity className="h-4 w-4 text-[var(--ink-3)]" />
          Listening events
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="text-[40px] font-semibold leading-none tracking-tight">{fmt(kpis.total_events)}</div>
          <Sparkline timeline={data.timeline} width={110} height={34} />
        </div>
        <p className="mt-3 text-xs text-[var(--ink-3)]">Every play, pause, save and skip</p>
      </Card>

      <StatTile
        icon={Headphones}
        label="Listeners"
        value={fmt(kpis.unique_users)}
        note="People with at least one event"
      />
      <StatTile
        icon={Repeat2}
        label="Actions per listener"
        value={perListener.toFixed(1)}
        note="Average events for each listener"
      />
      <StatTile
        icon={SkipForward}
        label="Skip rate"
        value={skipRateAvailable ? pct(skips, plays + skips, 1) : '—'}
        note={skipRateAvailable ? `${fmt(skips)} skips for every ${fmt(plays)} plays` : 'Choose “All actions” to see this'}
      />
      <div className="sm:col-span-2 lg:col-span-4">
        <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 text-sm">
          <span className="flex items-center gap-2 text-[var(--ink-2)]">
            <Disc3 className="h-4 w-4 text-[var(--ink-3)]" />
            Catalog in view:
          </span>
          <span>
            <strong className="font-semibold">{fmt(kpis.unique_songs)}</strong>{' '}
            <span className="text-[var(--ink-2)]">songs</span>
          </span>
          <span>
            <strong className="font-semibold">{fmt(kpis.unique_artists)}</strong>{' '}
            <span className="text-[var(--ink-2)]">artists</span>
          </span>
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="min-w-0 p-5">
      <div className="flex items-center gap-2 text-[13px] text-[var(--ink-2)]">
        <Icon className="h-4 w-4 text-[var(--ink-3)]" />
        {label}
      </div>
      <div className="mt-2 text-[40px] font-semibold leading-none tracking-tight">{value}</div>
      <p className="mt-3 text-xs text-[var(--ink-3)]">{note}</p>
    </Card>
  );
}

function Takeaways({ data }: { data: DashboardData }) {
  const lines: React.ReactNode[] = [];
  const total = data.kpis.total_events;

  const peak = [...data.timeline].sort((a, b) => b.events - a.events)[0];
  if (peak && peak.events > 0) {
    lines.push(
      <>
        Busiest hour is <strong>{hourLabel(peak.hour)} UTC</strong>, with {pct(peak.events, total)} of all activity.
      </>,
    );
  }
  const song = data.top_songs[0];
  if (song) {
    lines.push(
      <>
        <strong>{song.song_name}</strong> by {song.artist_name} is the most active song.
      </>,
    );
  }
  const dev = [...data.device_distribution].sort((a, b) => b.count - a.count)[0];
  if (dev) {
    lines.push(
      <>
        <strong>{deviceLabel(dev.device)}</strong> leads devices with {pct(dev.count, total)} of activity.
      </>,
    );
  }
  const ctry = [...data.country_distribution].sort((a, b) => b.count - a.count)[0];
  if (ctry) {
    lines.push(
      <>
        <strong>{countryLabel(ctry.country)}</strong> is the most active country.
      </>,
    );
  }
  if (!lines.length) return null;

  return (
    <Card className="px-5 py-4">
      <h2 className="text-[13px] font-medium text-[var(--ink-2)]">Key takeaways</h2>
      <ul className="mt-2 grid gap-x-8 gap-y-1.5 text-sm text-[var(--ink)] md:grid-cols-2">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TopMusicCard({
  data,
  view,
  setView,
}: {
  data: DashboardData;
  view: 'songs' | 'artists';
  setView: (v: 'songs' | 'artists') => void;
}) {
  const items: RankedItem[] = useMemo(
    () =>
      view === 'songs'
        ? data.top_songs.map((s) => ({
            key: `${s.song_name}-${s.artist_name}`,
            name: s.song_name,
            detail: s.artist_name,
            value: s.event_count,
            listeners: s.distinct_users,
          }))
        : data.top_artists.map((a) => ({
            key: a.artist_name,
            name: a.artist_name,
            detail: `${a.distinct_songs} ${a.distinct_songs === 1 ? 'song' : 'songs'}`,
            value: a.event_count,
            listeners: a.distinct_users,
          })),
    [data, view],
  );

  const leader = items[0];
  return (
    <ChartCard
      className="lg:col-span-7"
      title={view === 'songs' ? 'Which songs get the most activity?' : 'Which artists get the most activity?'}
      headline={leader ? <>{leader.name} is #1 with {fmt(leader.value)} events</> : undefined}
      action={
        <Segmented
          label="Rank by"
          value={view}
          onChange={setView}
          options={[
            { value: 'songs', label: 'Songs' },
            { value: 'artists', label: 'Artists' },
          ]}
        />
      }
      table={{
        columns: [view === 'songs' ? 'Song' : 'Artist', view === 'songs' ? 'Artist' : 'Songs', 'Events', 'Listeners'],
        rows: items.map((i) => [i.name, i.detail, i.value, i.listeners]),
        numeric: [2, 3],
      }}
    >
      {items.length ? (
        <RankedBars items={items} totalEvents={data.kpis.total_events} />
      ) : (
        <EmptyState message="No music matches these filters." />
      )}
    </ChartCard>
  );
}

function AboutDataCard({ data, checkedAt }: { data: DashboardData; checkedAt: string }) {
  const live = data.source === 'live_snowflake';
  const steps = ['App events', 'Kafka stream', 'Raw storage', 'Warehouse', 'Clean tables', 'This page'];
  return (
    <Card className="flex min-w-0 flex-col p-5 lg:col-span-5">
      <h2 className="text-[13px] font-medium text-[var(--ink-2)]">About this data</h2>
      <p className="mt-1 text-[17px] font-semibold leading-snug">
        {live ? 'Live from the warehouse' : 'Showing a saved snapshot'}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-[var(--ink-3)]">Last updated</dt>
          <dd className="mt-0.5 font-medium">{friendlyTimestamp(data.last_sync_timestamp)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ink-3)]">Checked by you</dt>
          <dd className="mt-0.5 font-medium">{checkedAt || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ink-3)]">Events in warehouse</dt>
          <dd className="mt-0.5 font-medium tabular">{fmt(data.kpis.total_available_events ?? data.kpis.total_events)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ink-3)]">Status</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
            {live ? (
              <CircleCheck className="h-4 w-4 text-[var(--good-ink)]" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-[var(--warning-ink)]" />
            )}
            {live ? 'Connected' : 'Warehouse offline'}
          </dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
          <Database className="h-3.5 w-3.5" />
          How events reach this page
        </div>
        <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-[var(--ink-2)]">{s}</span>
              {i < steps.length - 1 && <span className="text-[var(--ink-3)]">→</span>}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-[var(--ink-3)]">
          Duplicate and broken events are removed before they reach these charts.
        </p>
      </div>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[132px] animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="h-[340px] animate-pulse rounded-2xl bg-[var(--surface-sunken)] lg:col-span-8" />
        <div className="h-[340px] animate-pulse rounded-2xl bg-[var(--surface-sunken)] lg:col-span-4" />
      </div>
    </div>
  );
}

function peakHeadline(data: DashboardData) {
  const peak = [...data.timeline].sort((a, b) => b.events - a.events)[0];
  if (!peak || peak.events === 0) return 'No activity yet';
  return `Activity peaks at ${hourLabel(peak.hour)} UTC`;
}

function actionHeadline(data: DashboardData, action: ActionFilter) {
  if (action !== 'ALL') return `Showing ${actionLabel(action).toLowerCase()} only`;
  const top = [...data.event_distribution].sort((a, b) => b.count - a.count)[0];
  const spread =
    data.event_distribution.length > 1
      ? Math.max(...data.event_distribution.map((e) => e.count)) - Math.min(...data.event_distribution.map((e) => e.count))
      : 0;
  if (top && spread / Math.max(data.kpis.total_events, 1) < 0.05) return 'Actions are evenly split';
  return top ? `${actionLabel(top.type)} are the most common` : 'No actions';
}

function deviceHeadline(data: DashboardData) {
  const top = [...data.device_distribution].sort((a, b) => b.count - a.count)[0];
  return top ? `${deviceLabel(top.device)} leads with ${pct(top.count, data.kpis.total_events)}` : 'No device data';
}

function countryHeadline(data: DashboardData) {
  return `${data.country_distribution.length} ${data.country_distribution.length === 1 ? 'country' : 'countries'} with activity`;
}
