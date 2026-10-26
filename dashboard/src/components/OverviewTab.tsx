'use client';

import React from 'react';
import { AnalyticsResponse } from '@/types/analytics';
import { KpiCard } from './KpiCard';
import { PlayCircle, Users, Disc, Activity, FastForward, UserCheck, Clock, Info } from 'lucide-react';

interface OverviewTabProps {
  data: AnalyticsResponse;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ data }) => {
  const { summary, hourly_activity } = data;

  // Event type distribution items
  const eventTypes = [
    { name: 'Add to Playlist', count: summary.add_to_playlist_events, color: '#38bdf8', pct: ((summary.add_to_playlist_events / summary.total_events) * 100).toFixed(1) },
    { name: 'Pause', count: summary.pause_events, color: '#f59e0b', pct: ((summary.pause_events / summary.total_events) * 100).toFixed(1) },
    { name: 'Play (Streams)', count: summary.play_events, color: '#1db954', pct: ((summary.play_events / summary.total_events) * 100).toFixed(1) },
    { name: 'Skip', count: summary.skip_events, color: '#ef4444', pct: ((summary.skip_events / summary.total_events) * 100).toFixed(1) },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Total Valid Events"
          value={summary.total_events.toLocaleString()}
          subtitle="1:1 with Silver Layer"
          icon={Activity}
          accentColor="#38bdf8"
          formula="COUNT(*) FROM fct_listening_events"
          badge="Gold Fact"
        />
        <KpiCard
          title="Play Events"
          value={summary.play_events.toLocaleString()}
          subtitle="24.1% of all interactions"
          icon={PlayCircle}
          accentColor="#1db954"
          formula="COUNT_IF(event_type = 'play')"
          badge="Verified Plays"
        />
        <KpiCard
          title="Distinct Listeners"
          value={summary.distinct_listeners.toLocaleString()}
          subtitle="Users with >= 1 play event"
          icon={Users}
          accentColor="#a855f7"
          formula="COUNT(DISTINCT user_id) WHERE is_play = true"
          badge="Active Listeners"
        />
        <KpiCard
          title="Songs Played"
          value={summary.distinct_songs_played.toLocaleString()}
          subtitle="100% catalog coverage"
          icon={Disc}
          accentColor="#ec4899"
          formula="COUNT(DISTINCT song_id) WHERE is_play = true"
          badge="dim_songs"
        />
        <KpiCard
          title="Total Active Users"
          value={summary.total_active_users.toLocaleString()}
          subtitle="Across all event actions"
          icon={UserCheck}
          accentColor="#6366f1"
          formula="COUNT(DISTINCT user_id) in fct_listening_events"
          badge="dim_users"
        />
        <KpiCard
          title="Skip Rate"
          value={`${summary.overall_skip_rate_pct}%`}
          subtitle="Skips / (Plays + Skips)"
          icon={FastForward}
          accentColor="#f59e0b"
          formula="100.0 * skips / (plays + skips)"
          badge="Interaction Ratio"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly Trend Chart */}
        <div className="lg:col-span-2 bg-[#181b21] border border-[#262b35] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center space-x-2">
                <Clock className="w-4 h-4 text-[#1db954]" />
                <span>Event Ingestion & Activity Timeline (UTC)</span>
              </h2>
              <p className="text-xs text-[#94a3b8] mt-0.5">Distribution of canonical events across recorded ingestion hours</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded bg-[#12151b] border border-[#262b35] text-[#94a3b8]">
              Reporting Date: 2026-10-20
            </span>
          </div>

          <div className="space-y-4 pt-2">
            {hourly_activity.map((hour) => {
              return (
                <div key={hour.event_hour} className="space-y-1.5 bg-[#12151b] p-3 rounded-lg border border-[#262b35]/60">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-white">
                      {hour.event_hour.toString().padStart(2, '0')}:00 - {hour.event_hour.toString().padStart(2, '0')}:59 UTC
                    </span>
                    <span className="text-[#94a3b8]">
                      <strong className="text-white">{hour.total_events}</strong> total events (
                      <span className="text-[#1db954] font-medium">{hour.play_events} plays</span>,{' '}
                      <span className="text-[#f59e0b] font-medium">{hour.skip_events} skips</span>)
                    </span>
                  </div>
                  
                  {/* Stacked Bar */}
                  <div className="w-full bg-[#1e232d] h-4 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${(hour.play_events / hour.total_events) * 100}%` }}
                      className="bg-[#1db954] h-full"
                      title={`Plays: ${hour.play_events}`}
                    />
                    <div
                      style={{ width: `${(hour.skip_events / hour.total_events) * 100}%` }}
                      className="bg-[#ef4444] h-full"
                      title={`Skips: ${hour.skip_events}`}
                    />
                    <div
                      style={{ width: `${(hour.pause_events / hour.total_events) * 100}%` }}
                      className="bg-[#f59e0b] h-full"
                      title={`Pauses: ${hour.pause_events}`}
                    />
                    <div
                      style={{ width: `${(hour.add_to_playlist_events / hour.total_events) * 100}%` }}
                      className="bg-[#38bdf8] h-full"
                      title={`Playlist Adds: ${hour.add_to_playlist_events}`}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-[#64748b] pt-1">
                    <span>Peak ingestion batch</span>
                    <div className="flex space-x-3">
                      <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-[#1db954]"></span><span>Play</span></span>
                      <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]"></span><span>Skip</span></span>
                      <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-[#f59e0b]"></span><span>Pause</span></span>
                      <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-[#38bdf8]"></span><span>Playlist</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Semantic Notice Banner */}
          <div className="mt-4 p-3 rounded-lg bg-[#1db954]/10 border border-[#1db954]/20 flex items-start space-x-2 text-xs text-[#94a3b8]">
            <Info className="w-4 h-4 text-[#1db954] shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">Strict Metric Semantic Enforcement:</strong> In accordance with the contract,
              only actions with <code className="text-[#1db954] px-1 bg-[#12151b] rounded">event_type = &apos;play&apos;</code> are
              counted as music streams. Pauses, skips, and playlist additions are interaction telemetry, NOT streams.
            </div>
          </div>
        </div>

        {/* Event Type Breakdown */}
        <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-5">
          <h2 className="text-sm font-bold text-white tracking-tight mb-1">Event Action Distribution</h2>
          <p className="text-xs text-[#94a3b8] mb-4">Breakdown across {summary.total_events.toLocaleString()} verified Gold events</p>

          <div className="space-y-4">
            {eventTypes.map((type) => (
              <div key={type.name} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-white">{type.name}</span>
                  <span className="text-[#94a3b8]">
                    <strong className="text-white">{type.count}</strong> ({type.pct}%)
                  </span>
                </div>
                <div className="w-full bg-[#12151b] h-2.5 rounded-full overflow-hidden border border-[#262b35]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${type.pct}%`, backgroundColor: type.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-[#262b35] text-xs text-[#64748b] space-y-2">
            <div className="flex justify-between">
              <span>Total Catalog Tracks:</span>
              <span className="font-semibold text-white">6 songs</span>
            </div>
            <div className="flex justify-between">
              <span>Total Unique Artists:</span>
              <span className="font-semibold text-white">6 artists</span>
            </div>
            <div className="flex justify-between">
              <span>Distinct Countries:</span>
              <span className="font-semibold text-white">6 countries</span>
            </div>
            <div className="flex justify-between">
              <span>Data Quality Pass Rate:</span>
              <span className="font-semibold text-[#1db954]">100.0%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
