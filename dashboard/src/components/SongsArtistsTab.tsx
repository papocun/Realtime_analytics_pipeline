'use client';

import React from 'react';
import { AnalyticsResponse } from '@/types/analytics';
import { Music, Mic2, HelpCircle, AlertCircle } from 'lucide-react';

interface SongsArtistsTabProps {
  data: AnalyticsResponse;
  searchQuery: string;
}

export const SongsArtistsTab: React.FC<SongsArtistsTabProps> = ({ data, searchQuery }) => {
  const { song_rankings, artist_rankings } = data;

  const maxPlays = song_rankings.length > 0 ? Math.max(...song_rankings.map(s => s.play_events)) : 1;
  const maxArtistPlays = artist_rankings.length > 0 ? Math.max(...artist_rankings.map(a => a.play_events)) : 1;

  return (
    <div className="space-y-6">
      {/* Search notification if filtered */}
      {searchQuery && (
        <div className="p-3 bg-[#181b21] border border-[#262b35] rounded-lg text-xs text-[#94a3b8] flex items-center justify-between">
          <span>Filtering songs and artists by query: <strong className="text-white">&quot;{searchQuery}&quot;</strong></span>
          <span className="text-[#1db954]">{song_rankings.length} songs, {artist_rankings.length} artists matched</span>
        </div>
      )}

      {/* Grid: Songs on Left, Artists on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Songs Table */}
        <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center space-x-2">
                <Music className="w-4 h-4 text-[#1db954]" />
                <span>Top Songs by Play Count (dim_songs & agg_song_rankings)</span>
              </h2>
              <p className="text-xs text-[#94a3b8] mt-0.5">Ranked strictly by verified play events</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-[#12151b] border border-[#262b35] text-[#94a3b8]">
              {song_rankings.length} tracks
            </span>
          </div>

          {song_rankings.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#64748b]">
              <AlertCircle className="w-8 h-8 text-[#64748b] mx-auto mb-2" />
              No songs matched your search criteria.
            </div>
          ) : (
            <div className="space-y-3">
              {song_rankings.map((song) => {
                const playPct = (song.play_events / maxPlays) * 100;
                return (
                  <div
                    key={song.song_id}
                    className="p-3.5 rounded-lg bg-[#12151b] border border-[#262b35] hover:border-[#1db954]/40 transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs ${
                          song.play_rank === 1 ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' :
                          song.play_rank === 2 ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30' :
                          song.play_rank === 3 ? 'bg-amber-700/20 text-amber-500 border border-amber-700/30' :
                          'bg-[#181b21] text-[#94a3b8] border border-[#262b35]'
                        }`}>
                          {song.play_rank}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{song.song_name}</div>
                          <div className="text-xs text-[#94a3b8]">{song.artist_name}</div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-bold text-[#1db954]">{song.play_events} plays</div>
                        <div className="text-[11px] text-[#64748b]">{song.distinct_listeners} unique listeners</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-[#181b21] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#1db954] h-full rounded-full"
                        style={{ width: `${playPct}%` }}
                      />
                    </div>

                    {/* Metrics Footer */}
                    <div className="flex items-center justify-between text-[11px] text-[#64748b] pt-1">
                      <span>Total Interactions: <strong className="text-[#94a3b8]">{song.total_events}</strong></span>
                      <span>Total Skips: <strong className="text-[#f59e0b]">{song.total_skips}</strong></span>
                      <span className="px-1.5 py-0.5 rounded bg-[#181b21] border border-[#262b35] text-[#94a3b8]">
                        Skip Rate: <strong className="text-white">{song.skip_rate_pct}%</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Artists Leaderboard */}
        <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center space-x-2">
                <Mic2 className="w-4 h-4 text-[#8b5cf6]" />
                <span>Top Artists Leaderboard (agg_artist_rankings)</span>
              </h2>
              <p className="text-xs text-[#94a3b8] mt-0.5">Aggregated streams and listener reach per artist</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-[#12151b] border border-[#262b35] text-[#94a3b8]">
              {artist_rankings.length} artists
            </span>
          </div>

          {artist_rankings.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#64748b]">
              <AlertCircle className="w-8 h-8 text-[#64748b] mx-auto mb-2" />
              No artists matched your search criteria.
            </div>
          ) : (
            <div className="space-y-3">
              {artist_rankings.map((artist) => {
                const playPct = (artist.play_events / maxArtistPlays) * 100;
                return (
                  <div
                    key={artist.artist_name}
                    className="p-3.5 rounded-lg bg-[#12151b] border border-[#262b35] hover:border-[#8b5cf6]/40 transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs ${
                          artist.artist_rank === 1 ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' :
                          artist.artist_rank === 2 ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30' :
                          artist.artist_rank === 3 ? 'bg-amber-700/20 text-amber-500 border border-amber-700/30' :
                          'bg-[#181b21] text-[#94a3b8] border border-[#262b35]'
                        }`}>
                          {artist.artist_rank}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{artist.artist_name}</div>
                          <div className="text-xs text-[#94a3b8]">{artist.distinct_songs} catalog tracks</div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-bold text-[#8b5cf6]">{artist.play_events} plays</div>
                        <div className="text-[11px] text-[#64748b]">{artist.distinct_listeners} unique listeners</div>
                      </div>
                    </div>

                    <div className="w-full bg-[#181b21] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#8b5cf6] h-full rounded-full"
                        style={{ width: `${playPct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#64748b] pt-1">
                      <span>Reach: <strong className="text-[#94a3b8]">{artist.distinct_listeners} listeners</strong></span>
                      <span className="px-1.5 py-0.5 rounded bg-[#181b21] border border-[#262b35] text-[#94a3b8]">
                        Skip Rate: <strong className="text-white">{artist.skip_rate_pct}%</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Metric Formula Card */}
          <div className="mt-4 p-3 rounded-lg bg-[#12151b] border border-[#262b35] text-xs text-[#94a3b8] space-y-1">
            <div className="flex items-center space-x-1.5 text-white font-medium">
              <HelpCircle className="w-3.5 h-3.5 text-[#8b5cf6]" />
              <span>Exact Metric Semantics:</span>
            </div>
            <p>
              • <strong>Skip Rate Formula:</strong> <code className="text-[#38bdf8]">100.0 * skips / (plays + skips)</code>.
              The denominator is strictly defined as active playback decisions (playing or skipping), avoiding distortion from playlist saves.
            </p>
            <p>
              • <strong>Unsupported Metrics (Omitted):</strong> Completion rate, average listen duration, and artist royalty payouts
              are intentionally not shown because telemetry lacks duration/revenue fields.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
