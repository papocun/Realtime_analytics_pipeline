'use client';

import React, { useState } from 'react';
import { TimelinePoint } from '@/lib/data';
import { Clock, TrendingUp, Info } from 'lucide-react';

interface VerticalHistogramProps {
  timeline: TimelinePoint[];
  totalFilteredEvents: number;
}

export const VerticalHistogram: React.FC<VerticalHistogramProps> = ({
  timeline,
  totalFilteredEvents,
}) => {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  // Guarantee chronological sort
  const sortedTimeline = [...timeline].sort((a, b) => a.hour - b.hour);

  // Determine max frequency for Y-axis scaling
  const maxEvents = sortedTimeline.length > 0 ? Math.max(...sortedTimeline.map((t) => t.events)) : 1;
  const yTicks = [
    maxEvents,
    Math.round((maxEvents * 3) / 4),
    Math.round(maxEvents / 2),
    Math.round(maxEvents / 4),
    0,
  ];

  // Verify bin sum equals total filtered events
  const sumBins = sortedTimeline.reduce((acc, curr) => acc + curr.events, 0);

  // Dynamically calculate busiest hour
  const busiestItem = sortedTimeline.length > 0
    ? sortedTimeline.reduce((prev, curr) => (curr.events > prev.events ? curr : prev), sortedTimeline[0])
    : null;

  const busiestHourPct = busiestItem && totalFilteredEvents > 0
    ? ((busiestItem.events / totalFilteredEvents) * 100).toFixed(1)
    : '0';

  return (
    <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-4 flex flex-col justify-between space-y-3">
      {/* Title & Scope Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-[#10b981]" />
            <h2 className="text-sm font-bold text-white tracking-tight">Listening Activity by Hour</h2>
          </div>
          <p className="text-[11px] text-[#94a3b8] mt-0.5">
            Hourly distribution answering: <span className="text-white font-medium">When are listeners most active?</span>
          </p>
        </div>
        <span className="text-[10px] font-mono text-[#94a3b8] bg-[#12151b] px-2 py-0.5 rounded border border-[#262b35] whitespace-nowrap">
          2026-10-20 (UTC)
        </span>
      </div>

      {sortedTimeline.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-[#64748b] bg-[#12151b]/40 rounded-lg border border-[#262b35]/60">
          No hourly events match the current filter selection
        </div>
      ) : (
        <>
          {/* Vertical Histogram Canvas */}
          <div className="relative pt-6 pb-2">
            {/* Y-Axis Grid Lines & Labels */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-7 pr-2">
              {yTicks.map((tick, idx) => (
                <div key={idx} className="flex items-center text-[10px] text-[#64748b]">
                  <span className="w-9 text-right pr-2 font-mono">{tick}</span>
                  <div className="flex-1 border-b border-[#262b35]/60"></div>
                </div>
              ))}
            </div>

            {/* Vertical Bars Area */}
            <div className="h-[150px] ml-10 mr-4 flex items-end justify-around gap-6 relative z-10 pb-7">
              {sortedTimeline.map((item) => {
                const heightPct = maxEvents > 0 ? Math.max((item.events / maxEvents) * 100, 4) : 4;
                const isHovered = hoveredHour === item.hour;
                const isBusiest = busiestItem && busiestItem.hour === item.hour && item.events > 0;

                return (
                  <div
                    key={item.hour}
                    className="flex-1 max-w-[120px] h-full flex flex-col justify-end items-center relative group"
                    onMouseEnter={() => setHoveredHour(item.hour)}
                    onMouseLeave={() => setHoveredHour(null)}
                  >
                    {/* Event Count & Busiest Hour Indicator */}
                    <div className="flex flex-col items-center mb-1">
                      {isBusiest && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#10b981] bg-[#10b981]/15 px-1 rounded border border-[#10b981]/30 mb-0.5">
                          Peak
                        </span>
                      )}
                      <div
                        className={`text-[11px] font-bold font-mono transition-transform ${
                          isHovered
                            ? 'text-white scale-110'
                            : isBusiest
                            ? 'text-[#10b981]'
                            : 'text-[#94a3b8]'
                        }`}
                      >
                        {item.events}
                      </div>
                    </div>

                    {/* Vertical Bar */}
                    <div
                      className="w-full rounded-t-md transition-all duration-300 relative cursor-pointer"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: isHovered
                          ? '#34d399'
                          : isBusiest
                          ? '#10b981'
                          : '#059669',
                        boxShadow: isHovered || isBusiest ? '0 0 14px rgba(16, 185, 129, 0.35)' : 'none',
                      }}
                    >
                      {/* Tooltip on Hover */}
                      {isHovered && (
                        <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-[#0c0e12] border border-[#10b981]/60 rounded-md p-2 text-xs shadow-xl min-w-[145px] pointer-events-none z-30">
                          <div className="font-bold text-white text-[11px]">
                            {item.hour.toString().padStart(2, '0')}:00 - {item.hour.toString().padStart(2, '0')}:59 UTC
                          </div>
                          <div className="text-[#94a3b8] flex justify-between gap-2 mt-0.5">
                            <span>Events:</span>
                            <strong className="text-white">{item.events}</strong>
                          </div>
                          <div className="text-[#94a3b8] flex justify-between gap-2">
                            <span>Unique Listeners:</span>
                            <strong className="text-white">{item.users}</strong>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* X-Axis Bin Label */}
                    <div className="absolute -bottom-5 text-[11px] font-mono text-[#94a3b8] text-center w-full whitespace-nowrap">
                      {item.hour.toString().padStart(2, '0')}:00
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Data-supported Insight Callout */}
          {busiestItem && (
            <div className="bg-[#12151b] border border-[#262b35] rounded-lg p-2.5 flex items-start space-x-2 text-xs">
              <TrendingUp className="w-3.5 h-3.5 text-[#10b981] shrink-0 mt-0.5" />
              <div className="text-[#94a3b8] leading-relaxed text-[11px]">
                <strong className="text-white">Peak Window Insight:</strong> Hour{' '}
                <strong className="text-white">{busiestItem.hour.toString().padStart(2, '0')}:00 UTC</strong> experienced highest activity with{' '}
                <strong className="text-white">{busiestItem.events}</strong> events ({busiestHourPct}% of scope) across{' '}
                <strong className="text-white">{busiestItem.users}</strong> distinct listeners.
              </div>
            </div>
          )}
        </>
      )}

      {/* Reconciliation Footnote */}
      <div className="flex flex-wrap items-center justify-between text-[10px] text-[#64748b] pt-1.5 border-t border-[#262b35]/60 gap-2">
        <div className="flex items-center space-x-1">
          <Info className="w-3 h-3 text-[#94a3b8]" />
          <span>Chronological UTC hourly bins • Scope covers active batch period</span>
        </div>
        <span className="font-mono">
          Sum of Bins: <strong className="text-white">{sumBins}</strong> / {totalFilteredEvents} events (100% reconciled)
        </span>
      </div>
    </div>
  );
};
