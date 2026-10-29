'use client';

import React, { useMemo, useState } from 'react';
import { TimelinePoint } from '@/lib/data';
import { ChartTooltip, TooltipRow, useElementWidth } from './ui';
import { fmt, hourLabel, pct } from './format';

const HEIGHT = 220;
const PAD = { top: 24, right: 8, bottom: 28, left: 40 };

function niceMax(v: number) {
  if (v <= 0) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => n <= s) ?? 10;
  return step * exp;
}

export function HourlyChart({ timeline, totalEvents }: { timeline: TimelinePoint[]; totalEvents: number }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const hours = useMemo(() => {
    const byHour = new Map(timeline.map((t) => [t.hour, t]));
    return Array.from({ length: 24 }, (_, h) => byHour.get(h) ?? { hour: h, events: 0, users: 0 });
  }, [timeline]);

  const max = niceMax(Math.max(...hours.map((h) => h.events), 0));
  const peak = hours.reduce((a, b) => (b.events > a.events ? b : a), hours[0]);

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / 24;
  const barW = Math.max(4, Math.min(22, slot - 4));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];

  const hovered = hover !== null ? hours[hover] : null;

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={HEIGHT} role="img" aria-label="Events per hour of the day, UTC">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-3)" className="tabular">
              {fmt(t)}
            </text>
          </g>
        ))}

        {hours.map((h, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const top = y(h.events);
          const barH = PAD.top + plotH - top;
          const isPeak = h.hour === peak.hour && h.events > 0;
          const dim = hover !== null && hover !== i;
          return (
            <g key={h.hour}>
              {h.events > 0 && (
                <path
                  d={roundedTopBar(cx - barW / 2, top, barW, barH, Math.min(4, barW / 2, barH))}
                  fill="var(--series-1)"
                  opacity={dim ? 0.35 : 1}
                  style={{ transition: 'opacity 120ms' }}
                />
              )}
              {isPeak && (
                <text x={cx} y={top - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink)" className="tabular">
                  {fmt(h.events)}
                </text>
              )}
              {i % 3 === 0 && (
                <text x={cx} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                  {hourLabel(h.hour, true)}
                </text>
              )}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${hourLabel(h.hour)}: ${fmt(h.events)} events${h.users !== undefined ? `, ${fmt(h.users)} listeners` : ""}`}
              />
            </g>
          );
        })}
      </svg>

      {hovered && hover !== null && (
        <ChartTooltip x={PAD.left + slot * hover + slot / 2} y={Math.max(PAD.top + 30, y(hovered.events))} containerWidth={width}>
          <div className="mb-1 font-semibold">
            {hourLabel(hovered.hour)} – {hourLabel((hovered.hour + 1) % 24)} UTC
          </div>
          <TooltipRow label="Events" value={fmt(hovered.events)} />
          {hovered.users !== undefined && <TooltipRow label="Listeners" value={fmt(hovered.users)} />}
          <TooltipRow label="Share of day" value={pct(hovered.events, totalEvents, 1)} />
        </ChartTooltip>
      )}
    </div>
  );
}

function roundedTopBar(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export function Sparkline({ timeline, width = 120, height = 32 }: { timeline: TimelinePoint[]; width?: number; height?: number }) {
  const byHour = new Map(timeline.map((t) => [t.hour, t.events]));
  const values = Array.from({ length: 24 }, (_, h) => byHour.get(h) ?? 0);
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / 23) * (width - 4) + 2, height - 3 - (v / max) * (height - 6)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${width - 2},${height - 3} L2,${height - 3} Z`;
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={area} fill="var(--accent-soft)" />
      <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
