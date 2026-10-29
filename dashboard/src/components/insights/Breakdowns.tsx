'use client';

import React, { useState } from 'react';
import { Play, Pause, ListPlus, SkipForward, Check } from 'lucide-react';
import { CountryDistItem, DeviceDistItem, EventDistItem } from '@/lib/data';
import { useElementWidth } from './ui';
import { ACTIONS, DEVICES, countryLabel, fmt, pct, toHundredCells } from './format';

const ACTION_ICONS: Record<string, React.ElementType> = {
  play: Play,
  pause: Pause,
  add_to_playlist: ListPlus,
  skip: SkipForward,
};

export function ActionMix({ items }: { items: EventDistItem[] }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const counts = ACTIONS.map((a) => ({ ...a, count: items.find((i) => i.type === a.key)?.count ?? 0 })).filter(
    (a) => a.count > 0,
  );
  const total = counts.reduce((s, a) => s + a.count, 0);

  const GAP = 2;
  const usable = width - GAP * Math.max(0, counts.length - 1);
  const segments = counts.map((a, i) => {
    const before = counts.slice(0, i).reduce((s, c) => s + c.count, 0);
    const x = total > 0 ? (before / total) * usable + i * GAP : 0;
    const w = total > 0 ? (a.count / total) * usable : 0;
    return { ...a, x, w };
  });

  return (
    <div className="space-y-5">
      <div ref={ref} className="w-full">
        <svg width={width} height={40} role="img" aria-label="Share of each listener action">
          {segments.map((s, i) => {
            const label = pct(s.count, total);
            const fits = s.w > label.length * 7.5 + 12;
            const first = i === 0;
            const last = i === segments.length - 1;
            return (
              <g key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
                <path
                  d={segmentPath(s.x, 0, s.w, 40, 6, first, last)}
                  fill={s.color}
                  opacity={hover && hover !== s.key ? 0.35 : 1}
                  style={{ transition: 'opacity 120ms' }}
                >
                  <title>{`${s.label}: ${fmt(s.count)} (${pct(s.count, total, 1)})`}</title>
                </path>
                {fits && (
                  <text
                    x={s.x + s.w / 2}
                    y={20}
                    dy="0.35em"
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={600}
                    fill={s.key === 'skip' ? '#0b0b0b' : '#ffffff'}
                    pointerEvents="none"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {counts.map((a) => {
          const Icon = ACTION_ICONS[a.key];
          return (
            <li
              key={a.key}
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
              className={`flex items-center gap-3 rounded-xl border border-[var(--border)] p-3 transition-colors ${
                hover === a.key ? 'bg-[var(--surface-hover)]' : ''
              }`}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `color-mix(in srgb, ${a.color} 16%, transparent)`, color: a.color }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs text-[var(--ink-2)]">{a.label}</div>
                <div className="text-[15px] font-semibold text-[var(--ink)]">
                  {fmt(a.count)} <span className="text-xs font-normal text-[var(--ink-3)]">· {pct(a.count, total, 1)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function segmentPath(x: number, y: number, w: number, h: number, r: number, roundLeft: boolean, roundRight: boolean) {
  const rl = roundLeft ? Math.min(r, w / 2) : 0;
  const rr = roundRight ? Math.min(r, w / 2) : 0;
  return [
    `M${x + rl},${y}`,
    `H${x + w - rr}`,
    rr ? `Q${x + w},${y} ${x + w},${y + rr}` : '',
    `V${y + h - rr}`,
    rr ? `Q${x + w},${y + h} ${x + w - rr},${y + h}` : '',
    `H${x + rl}`,
    rl ? `Q${x},${y + h} ${x},${y + h - rl}` : '',
    `V${y + rl}`,
    rl ? `Q${x},${y} ${x + rl},${y}` : '',
    'Z',
  ].join(' ');
}

export function DeviceWaffle({ items }: { items: DeviceDistItem[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const rows = DEVICES.map((d) => ({ ...d, count: items.find((i) => i.device === d.key)?.count ?? 0 })).filter(
    (d) => d.count > 0,
  );
  const total = rows.reduce((s, d) => s + d.count, 0);
  const cells = toHundredCells(rows.map((r) => r.count));
  const squares = rows.flatMap((r, i) => Array.from({ length: cells[i] }, () => r));

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <div
        className="grid w-full max-w-[220px] shrink-0 grid-cols-10 gap-[3px] self-center"
        role="img"
        aria-label={rows.map((r) => `${r.label} ${pct(r.count, total)}`).join(', ')}
      >
        {squares.map((r, i) => (
          <span
            key={i}
            className="aspect-square rounded-[3px] transition-opacity"
            style={{ background: r.color, opacity: hover && hover !== r.key ? 0.25 : 1 }}
            onMouseEnter={() => setHover(r.key)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </div>
      <ul className="w-full space-y-2">
        {rows.map((r) => (
          <li
            key={r.key}
            onMouseEnter={() => setHover(r.key)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors ${
              hover === r.key ? 'bg-[var(--surface-hover)]' : ''
            }`}
          >
            <span className="flex items-center gap-2 text-[13px] text-[var(--ink)]">
              <span className="h-3 w-3 rounded-[3px]" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="text-right">
              <span className="text-[15px] font-semibold text-[var(--ink)]">{pct(r.count, total)}</span>
              <span className="ml-2 text-xs text-[var(--ink-3)] tabular">{fmt(r.count)}</span>
            </span>
          </li>
        ))}
        <li className="px-2 pt-1 text-xs text-[var(--ink-3)]">Each square = 1% of activity</li>
      </ul>
    </div>
  );
}

export function CountryLollipop({
  items,
  selected,
  onSelect,
}: {
  items: CountryDistItem[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, c) => s + c.count, 0);
  const max = Math.max(...sorted.map((c) => c.count), 1);

  return (
    <div className="space-y-1">
      {sorted.map((c) => {
        const isSel = selected === c.country;
        const dim = selected !== 'ALL' && !isSel;
        const w = (c.count / max) * 100;
        return (
          <button
            key={c.country}
            type="button"
            onClick={() => onSelect(isSel ? 'ALL' : c.country)}
            aria-pressed={isSel}
            title={isSel ? 'Click to show all countries' : `Show only ${countryLabel(c.country)}`}
            className={`group grid w-full grid-cols-[minmax(110px,150px)_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--surface-hover)] ${
              isSel ? 'bg-[var(--accent-soft)]' : ''
            }`}
          >
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--ink)]">
              <span
                aria-hidden="true"
                className="inline-flex h-5 w-7 shrink-0 items-center justify-center rounded bg-[var(--surface-sunken)] text-[10px] font-semibold text-[var(--ink-2)]"
              >
                {c.country}
              </span>
              <span className="truncate">{countryLabel(c.country)}</span>
              {isSel && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent-ink)]" />}
            </span>
            <span className="relative h-4" style={{ opacity: dim ? 0.4 : 1 }}>
              <span className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded bg-[var(--series-1)]" style={{ width: `${w}%` }} />
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--series-1)]"
                style={{ left: `${w}%` }}
              />
            </span>
            <span className="w-[120px] text-right text-xs text-[var(--ink-3)] tabular">
              <span className="text-[13px] font-semibold text-[var(--ink)]">{fmt(c.count)}</span> · {fmt(c.users)} listeners
            </span>
          </button>
        );
      })}
      <p className="px-2 pt-2 text-xs text-[var(--ink-3)]">
        {sorted.length > 0 && `${countryLabel(sorted[0].country)} leads with ${pct(sorted[0].count, total)} of activity. `}
        Click a country to filter the page.
      </p>
    </div>
  );
}
