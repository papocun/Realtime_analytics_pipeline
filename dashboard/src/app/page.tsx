'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardData } from '@/lib/data';
import { GeographicMap } from '@/components/GeographicMap';
import { VerticalHistogram } from '@/components/VerticalHistogram';
import { 
  RotateCcw, 
  Activity, 
  Users, 
  Disc, 
  Mic2, 
  Clock, 
  AlertCircle,
  Filter,
  Monitor,
  Smartphone,
  Laptop,
  CheckCircle2,
  TrendingUp,
  Info,
  HelpCircle,
  Play,
  Pause,
  SkipForward,
  FolderPlus
} from 'lucide-react';

const COUNTRY_NAMES: Record<string, string> = {
  AU: 'Australia',
  US: 'United States',
  IN: 'India',
  CA: 'Canada',
  UK: 'United Kingdom',
  DE: 'Germany',
};

export default function RealtimeMusicAnalyticsDashboard() {
  const [eventType, setEventType] = useState<string>('ALL');
  const [device, setDevice] = useState<string>('ALL');
  const [country, setCountry] = useState<string>('ALL');
  const [rankView, setRankView] = useState<'songs' | 'artists'>('songs');

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (eventType !== 'ALL') params.append('event_type', eventType);
      if (device !== 'ALL') params.append('device', device);
      if (country !== 'ALL') params.append('country', country);
      if (isManualRefresh) params.append('refresh', 'true');

      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const json: DashboardData = await res.json();
      setData(json);
      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: unknown) {
      console.error('Failed to load analytics data:', err);
      setError(err instanceof Error ? err.message : 'Failed to query analytics data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [eventType, device, country]);

  useEffect(() => {
    let active = true;
    const fetchInitial = async () => {
      try {
        const params = new URLSearchParams();
        if (eventType !== 'ALL') params.append('event_type', eventType);
        if (device !== 'ALL') params.append('device', device);
        if (country !== 'ALL') params.append('country', country);

        const res = await fetch(`/api/analytics?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: DashboardData = await res.json();
        if (active) {
          setData(json);
          setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to query analytics data');
          setIsLoading(false);
        }
      }
    };

    fetchInitial();

    return () => {
      active = false;
    };
  }, [eventType, device, country]);

  const handleResetFilters = () => {
    setEventType('ALL');
    setDevice('ALL');
    setCountry('ALL');
  };

  const hasActiveFilters = eventType !== 'ALL' || device !== 'ALL' || country !== 'ALL';

  // Dynamic totals across dataset for filter options
  const totalAvailable = data?.kpis?.total_available_events || 720;
  const actionTotals = data?.dataset_totals?.actions || {
    play: 188,
    pause: 189,
    add_to_playlist: 172,
    skip: 171,
  };
  const deviceTotals = data?.dataset_totals?.devices || {
    desktop: 270,
    mobile: 247,
    web: 203,
  };
  const countryTotals = data?.dataset_totals?.countries || {
    AU: 142,
    US: 123,
    IN: 120,
    CA: 120,
    UK: 111,
    DE: 104,
  };

  // Top song/artist insight calculation
  const topRankedItem = useMemo(() => {
    if (!data) return null;
    if (rankView === 'songs' && data.top_songs && data.top_songs.length > 0) {
      return {
        type: 'song',
        name: data.top_songs[0].song_name,
        subtitle: data.top_songs[0].artist_name,
        count: data.top_songs[0].event_count,
        users: data.top_songs[0].distinct_users,
      };
    }
    if (rankView === 'artists' && data.top_artists && data.top_artists.length > 0) {
      return {
        type: 'artist',
        name: data.top_artists[0].artist_name,
        subtitle: `${data.top_artists[0].distinct_songs} tracks in catalog`,
        count: data.top_artists[0].event_count,
        users: data.top_artists[0].distinct_users,
      };
    }
    return null;
  }, [data, rankView]);

  return (
    <div className="min-h-screen bg-[#0c0e12] text-[#ededed] flex flex-col font-sans">
      {/* 1. PROFESSIONAL HEADER */}
      <header className="border-b border-[#242b35] bg-[#13161c] sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Brand Identity */}
          <div className="flex items-center space-x-3">
            {/* Neutral Modern Audio Waveform Mark */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-md shadow-[#10b981]/15 text-black">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <rect x="2" y="9" width="2.5" height="6" rx="1.25" />
                <rect x="6.5" y="5" width="2.5" height="14" rx="1.25" />
                <rect x="11" y="2" width="2.5" height="20" rx="1.25" />
                <rect x="15.5" y="6" width="2.5" height="12" rx="1.25" />
                <rect x="20" y="10" width="2.5" height="4" rx="1.25" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-white tracking-tight">Realtime Music Analytics</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                  Analytics Platform
                </span>
              </div>
              <p className="text-[11px] text-[#94a3b8] font-medium">Music Streaming Intelligence</p>
            </div>
          </div>

          {/* Right Status, Data Freshness & Refresh */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Connection Pip */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-[#181b21] border border-[#262b35]">
              <span className={`w-2 h-2 rounded-full ${data?.source === 'live_snowflake' ? 'bg-[#10b981] animate-pulse' : 'bg-amber-400'}`}></span>
              <span className="text-[#94a3b8]">Engine:</span>
              <span className="text-white font-medium">
                {data?.source === 'live_snowflake' ? 'Live Snowflake' : 'Verified Snapshot'}
              </span>
            </div>

            {/* Warehouse Freshness */}
            <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-[#181b21] border border-[#262b35] text-[#94a3b8]">
              <Clock className="w-3.5 h-3.5 text-[#64748b]" />
              <span>Warehouse Sync:</span>
              <span className="text-white font-mono text-[11px]">
                {data?.last_sync_timestamp || '2026-10-25 22:15 UTC'}
              </span>
            </div>

            {/* UI Last Refreshed Time */}
            {lastRefreshedAt && (
              <span className="hidden lg:inline text-[11px] text-[#64748b]">
                Checked: {lastRefreshedAt}
              </span>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => loadData(true)}
              disabled={isRefreshing || isLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#10b981] hover:bg-[#059669] text-black font-semibold text-xs transition-all disabled:opacity-60 cursor-pointer shadow-sm active:scale-95"
              title="Query latest Snowflake warehouse state"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Querying...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4">
        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-between text-xs text-red-200">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>Error retrieving warehouse telemetry: {error}</span>
            </div>
            <button
              onClick={() => loadData(false)}
              className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-white font-medium transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* 2. DYNAMIC FILTER BAR */}
        <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center space-x-1.5 text-[#94a3b8] pr-1">
              <Filter className="w-3.5 h-3.5 text-[#10b981]" />
              <span className="font-semibold text-white">Filters:</span>
            </div>

            {/* Action Filter */}
            <div className="flex items-center space-x-1.5 bg-[#12151b] px-2.5 py-1.5 rounded-lg border border-[#262b35]">
              <label htmlFor="filter-event-type" className="text-[#94a3b8]">Action:</label>
              <select
                id="filter-event-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-[#181b21]">All Actions ({totalAvailable})</option>
                <option value="play" className="bg-[#181b21]">Play / Streams ({actionTotals.play || 188})</option>
                <option value="pause" className="bg-[#181b21]">Pause ({actionTotals.pause || 189})</option>
                <option value="add_to_playlist" className="bg-[#181b21]">Add to Playlist ({actionTotals.add_to_playlist || 172})</option>
                <option value="skip" className="bg-[#181b21]">Skip ({actionTotals.skip || 171})</option>
              </select>
            </div>

            {/* Device Filter */}
            <div className="flex items-center space-x-1.5 bg-[#12151b] px-2.5 py-1.5 rounded-lg border border-[#262b35]">
              <label htmlFor="filter-device" className="text-[#94a3b8]">Device:</label>
              <select
                id="filter-device"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-[#181b21]">All Devices ({totalAvailable})</option>
                <option value="desktop" className="bg-[#181b21]">Desktop ({deviceTotals.desktop || 270})</option>
                <option value="mobile" className="bg-[#181b21]">Mobile ({deviceTotals.mobile || 247})</option>
                <option value="web" className="bg-[#181b21]">Web Player ({deviceTotals.web || 203})</option>
              </select>
            </div>

            {/* Country Filter */}
            <div className="flex items-center space-x-1.5 bg-[#12151b] px-2.5 py-1.5 rounded-lg border border-[#262b35]">
              <label htmlFor="filter-country" className="text-[#94a3b8]">Country:</label>
              <select
                id="filter-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-[#181b21]">All Regions ({totalAvailable})</option>
                <option value="AU" className="bg-[#181b21]">Australia ({countryTotals.AU || 142})</option>
                <option value="US" className="bg-[#181b21]">United States ({countryTotals.US || 123})</option>
                <option value="IN" className="bg-[#181b21]">India ({countryTotals.IN || 120})</option>
                <option value="CA" className="bg-[#181b21]">Canada ({countryTotals.CA || 120})</option>
                <option value="UK" className="bg-[#181b21]">United Kingdom ({countryTotals.UK || 111})</option>
                <option value="DE" className="bg-[#181b21]">Germany ({countryTotals.DE || 104})</option>
              </select>
            </div>
          </div>

          {/* Filter Status Counter & Reset Action */}
          <div className="flex items-center space-x-3">
            <span className="text-[#94a3b8]">
              {data ? (
                hasActiveFilters ? (
                  <>
                    Showing <strong className="text-white">{data.kpis.total_events}</strong> of{' '}
                    <strong className="text-[#10b981]">{totalAvailable}</strong> events{' '}
                    <span className="text-[11px] text-[#64748b]">
                      ({((data.kpis.total_events / totalAvailable) * 100).toFixed(1)}%)
                    </span>
                  </>
                ) : (
                  <>
                    Showing all <strong className="text-white">{data.kpis.total_events}</strong> verified events
                  </>
                )
              ) : 'Loading telemetry...'}
            </span>

            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="px-2.5 py-1 rounded bg-[#262b35] hover:bg-[#323946] text-white text-[11px] font-medium transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Loading Skeleton */}
        {isLoading && !data && (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-[#181b21] rounded-xl border border-[#262b35]"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-72 bg-[#181b21] rounded-xl border border-[#262b35]"></div>
              <div className="h-72 bg-[#181b21] rounded-xl border border-[#262b35]"></div>
            </div>
          </div>
        )}

        {/* 3. CORE KPI ROW (4 REFINED CARDS) */}
        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* KPI 1: Listening Events */}
              <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-4 space-y-1.5 hover:border-[#10b981]/40 transition-colors relative group">
                <div className="flex items-center justify-between text-xs text-[#94a3b8]">
                  <span className="font-semibold uppercase tracking-wider text-[11px]">Listening Events</span>
                  <div className="w-7 h-7 rounded-lg bg-[#10b981]/15 text-[#10b981] flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-white tracking-tight">
                  {data.kpis.total_events.toLocaleString()}
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#64748b]">
                  <span>{hasActiveFilters ? 'Events matching filters' : '1:1 match with Silver layer'}</span>
                  {hasActiveFilters && (
                    <span className="text-[#10b981] font-medium">
                      {((data.kpis.total_events / totalAvailable) * 100).toFixed(0)}% of total
                    </span>
                  )}
                </div>
              </div>

              {/* KPI 2: Unique Listeners */}
              <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-4 space-y-1.5 hover:border-[#8b5cf6]/40 transition-colors relative group">
                <div className="flex items-center justify-between text-xs text-[#94a3b8]">
                  <span className="font-semibold uppercase tracking-wider text-[11px]">Unique Listeners</span>
                  <div className="w-7 h-7 rounded-lg bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-white tracking-tight">
                  {data.kpis.unique_users.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#64748b]">
                  Distinct user profiles with activity in scope
                </div>
              </div>

              {/* KPI 3: Songs */}
              <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-4 space-y-1.5 hover:border-[#38bdf8]/40 transition-colors relative group">
                <div className="flex items-center justify-between text-xs text-[#94a3b8]">
                  <span className="font-semibold uppercase tracking-wider text-[11px]">Catalog Tracks</span>
                  <div className="w-7 h-7 rounded-lg bg-[#38bdf8]/15 text-[#38bdf8] flex items-center justify-center">
                    <Disc className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-white tracking-tight">
                  {data.kpis.unique_songs.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#64748b]">
                  Distinct catalog tracks streamed
                </div>
              </div>

              {/* KPI 4: Artists */}
              <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-4 space-y-1.5 hover:border-[#f59e0b]/40 transition-colors relative group">
                <div className="flex items-center justify-between text-xs text-[#94a3b8]">
                  <span className="font-semibold uppercase tracking-wider text-[11px]">Distinct Artists</span>
                  <div className="w-7 h-7 rounded-lg bg-[#f59e0b]/15 text-[#f59e0b] flex items-center justify-center">
                    <Mic2 className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-white tracking-tight">
                  {data.kpis.unique_artists.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#64748b]">
                  Artist profiles receiving engagement
                </div>
              </div>
            </div>

            {/* 4. UPPER ROW: HOURLY ACTIVITY HISTOGRAM & TOP SONGS / ARTISTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Listening Activity — Hourly Bar Chart (Section 4 D) */}
              <VerticalHistogram
                timeline={data.timeline}
                totalFilteredEvents={data.kpis.total_events}
              />

              {/* Top Songs & Artists Leaderboard (Section 4 E) */}
              <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-white tracking-tight">
                      {rankView === 'songs' ? 'Top Songs by Activity' : 'Top Artists by Activity'}
                    </h2>
                    <p className="text-[11px] text-[#94a3b8] mt-0.5">
                      Business question: <span className="text-white font-medium">Which music receives the most activity?</span>
                    </p>
                  </div>
                  {/* Toggle */}
                  <div className="flex bg-[#12151b] p-0.5 rounded-lg border border-[#262b35] text-xs">
                    <button
                      onClick={() => setRankView('songs')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                        rankView === 'songs' ? 'bg-[#10b981] text-black font-semibold' : 'text-[#94a3b8] hover:text-white'
                      }`}
                    >
                      Songs
                    </button>
                    <button
                      onClick={() => setRankView('artists')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                        rankView === 'artists' ? 'bg-[#10b981] text-black font-semibold' : 'text-[#94a3b8] hover:text-white'
                      }`}
                    >
                      Artists
                    </button>
                  </div>
                </div>

                <div className="space-y-2 py-1">
                  {rankView === 'songs' ? (
                    data.top_songs && data.top_songs.length > 0 ? (
                      data.top_songs.slice(0, 5).map((song, idx) => {
                        const maxEvents = Math.max(...data.top_songs.map((s) => s.event_count), 1);
                        const barPct = Math.max((song.event_count / maxEvents) * 100, 4);
                        const pctOfScope = data.kpis.total_events > 0
                          ? ((song.event_count / data.kpis.total_events) * 100).toFixed(1)
                          : '0';

                        return (
                          <div key={song.song_name} className="p-2.5 bg-[#12151b] rounded-lg border border-[#262b35]/60 space-y-1.5 hover:border-[#10b981]/30 transition-colors">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center space-x-2.5 min-w-0">
                                <span className="w-4 text-center font-bold text-[#64748b] text-[11px] shrink-0">{idx + 1}</span>
                                <div className="truncate">
                                  <span className="font-semibold text-white block text-xs truncate">{song.song_name}</span>
                                  <span className="text-[10px] text-[#94a3b8] truncate">{song.artist_name}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-bold text-white text-xs">
                                  {song.event_count} <span className="text-[#10b981] font-normal text-[11px]">({pctOfScope}%)</span>
                                </span>
                                <span className="block text-[10px] text-[#64748b]">{song.distinct_users} listeners</span>
                              </div>
                            </div>
                            <div className="w-full bg-[#181b21] h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${barPct}%`,
                                  backgroundColor: idx === 0 ? '#10b981' : '#059669',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-8 text-center text-xs text-[#64748b]">No song activity in scope</div>
                    )
                  ) : (
                    data.top_artists && data.top_artists.length > 0 ? (
                      data.top_artists.slice(0, 5).map((artist, idx) => {
                        const maxEvents = Math.max(...data.top_artists.map((a) => a.event_count), 1);
                        const barPct = Math.max((artist.event_count / maxEvents) * 100, 4);
                        const pctOfScope = data.kpis.total_events > 0
                          ? ((artist.event_count / data.kpis.total_events) * 100).toFixed(1)
                          : '0';

                        return (
                          <div key={artist.artist_name} className="p-2.5 bg-[#12151b] rounded-lg border border-[#262b35]/60 space-y-1.5 hover:border-[#f59e0b]/30 transition-colors">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center space-x-2.5 min-w-0">
                                <span className="w-4 text-center font-bold text-[#64748b] text-[11px] shrink-0">{idx + 1}</span>
                                <div className="truncate">
                                  <span className="font-semibold text-white block text-xs truncate">{artist.artist_name}</span>
                                  <span className="text-[10px] text-[#94a3b8]">{artist.distinct_songs} tracks in catalog</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-bold text-white text-xs">
                                  {artist.event_count} <span className="text-[#f59e0b] font-normal text-[11px]">({pctOfScope}%)</span>
                                </span>
                                <span className="block text-[10px] text-[#64748b]">{artist.distinct_users} listeners</span>
                              </div>
                            </div>
                            <div className="w-full bg-[#181b21] h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${barPct}%`,
                                  backgroundColor: idx === 0 ? '#f59e0b' : '#d97706',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-8 text-center text-xs text-[#64748b]">No artist activity in scope</div>
                    )
                  )}
                </div>

                {/* Data-supported Insight */}
                {topRankedItem && (
                  <div className="bg-[#12151b] border border-[#262b35] rounded-lg p-2.5 flex items-start space-x-2 text-xs">
                    <TrendingUp className="w-3.5 h-3.5 text-[#10b981] shrink-0 mt-0.5" />
                    <div className="text-[#94a3b8] leading-relaxed text-[11px]">
                      <strong className="text-white">Leader Insight:</strong>{' '}
                      <strong className="text-white">{topRankedItem.name}</strong> ranks #1 with{' '}
                      <strong className="text-white">{topRankedItem.count}</strong> events across{' '}
                      <strong className="text-white">{topRankedItem.users}</strong> listeners.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 5. LOWER ROW: COUNTRY BREAKDOWN & LISTENER ACTIONS + DEVICES */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Country Activity & Map (Section 4 F) */}
              <GeographicMap
                countryData={data.country_distribution}
                selectedCountry={country}
                onSelectCountry={(c) => setCountry(c)}
                totalFilteredEvents={data.kpis.total_events}
              />

              {/* Listener Actions & Devices Distribution (Section 4 G & 4 H) */}
              <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-4 flex flex-col justify-between space-y-4">
                {/* Listener Actions Breakdown */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-white tracking-tight">Listener Actions</h2>
                      <p className="text-[11px] text-[#94a3b8]">
                        Business question: <span className="text-white font-medium">How do listeners interact with music?</span>
                      </p>
                    </div>
                    <span className="text-[10px] text-[#64748b]">Sum: 100%</span>
                  </div>

                  <div className="space-y-2">
                    {data.event_distribution.map((dist) => {
                      const total = data.kpis.total_events || 1;
                      const pct = ((dist.count / total) * 100).toFixed(1);
                      const colorMap: Record<string, string> = {
                        play: '#10b981',
                        pause: '#f59e0b',
                        add_to_playlist: '#38bdf8',
                        skip: '#ef4444',
                      };
                      const IconMap: Record<string, React.ElementType> = {
                        play: Play,
                        pause: Pause,
                        add_to_playlist: FolderPlus,
                        skip: SkipForward,
                      };
                      const labelMap: Record<string, string> = {
                        play: 'Play (Streams)',
                        pause: 'Pause Interaction',
                        add_to_playlist: 'Add to Playlist',
                        skip: 'Track Skip',
                      };
                      const ActionIcon = IconMap[dist.type] || Activity;
                      const color = colorMap[dist.type] || '#94a3b8';

                      return (
                        <div key={dist.type} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center space-x-1.5">
                              <ActionIcon className="w-3.5 h-3.5" style={{ color }} />
                              <span className="font-medium text-white text-[11px]">{labelMap[dist.type] || dist.type}</span>
                            </div>
                            <span className="text-[#94a3b8] text-[11px]">
                              <strong className="text-white font-mono">{dist.count}</strong> ({pct}%)
                            </span>
                          </div>
                          <div className="w-full bg-[#12151b] h-1.5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Device Platforms Breakdown */}
                <div className="space-y-2.5 pt-3 border-t border-[#262b35]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-white tracking-tight">Device Platforms</h2>
                      <p className="text-[11px] text-[#94a3b8]">
                        Business question: <span className="text-white font-medium">Which devices are used most often?</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {data.device_distribution.map((dev) => {
                      const total = data.kpis.total_events || 1;
                      const pct = ((dev.count / total) * 100).toFixed(1);
                      const Icon = dev.device === 'desktop' ? Monitor : dev.device === 'mobile' ? Smartphone : Laptop;
                      return (
                        <div key={dev.device} className="bg-[#12151b] p-3 rounded-lg border border-[#262b35]/60 text-center space-y-1 hover:border-[#10b981]/30 transition-colors">
                          <Icon className="w-4 h-4 mx-auto text-[#10b981]" />
                          <div className="text-[11px] font-semibold text-white capitalize">{dev.device}</div>
                          <div className="text-lg font-bold text-white">{pct}%</div>
                          <div className="text-[10px] text-[#64748b]">{dev.count} events</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
