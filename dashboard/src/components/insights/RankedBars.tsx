'use client';

import React from 'react';
import { fmt, pct } from './format';

export interface RankedItem {
  key: string;
  name: string;
  detail: string;
  value: number;
  listeners: number;
}

export function RankedBars({ items, totalEvents, limit = 8 }: { items: RankedItem[]; totalEvents: number; limit?: number }) {
  const shown = items.slice(0, limit);
  const max = Math.max(...shown.map((i) => i.value), 1);

  return (
    <ol className="space-y-3">
      {shown.map((item, idx) => {
        const w = Math.max(2, (item.value / max) * 100);
        const leader = idx === 0;
        return (
          <li key={item.key} className="grid grid-cols-[20px_1fr] items-start gap-3">
            <span className={`pt-0.5 text-right text-xs tabular ${leader ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>
              {idx + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 truncate text-[13px]">
                  <span className="font-medium text-[var(--ink)]">{item.name}</span>
                  <span className="text-[var(--ink-3)]"> · {item.detail}</span>
                </div>
                <div className="shrink-0 text-xs text-[var(--ink-3)] tabular">
                  <span className="text-[13px] font-semibold text-[var(--ink)]">{fmt(item.value)}</span>
                  <span className="ml-1.5">{pct(item.value, totalEvents, 1)}</span>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-2" title={`${fmt(item.listeners)} listeners`}>
                <div className="h-2 flex-1 rounded-full bg-[var(--surface-sunken)]">
                  <div
                    className="h-2 rounded-full transition-[width] duration-300"
                    style={{ width: `${w}%`, background: leader ? 'var(--series-1)' : 'var(--neutral-mark)' }}
                  />
                </div>
                <span className="w-[86px] shrink-0 text-right text-[11px] text-[var(--ink-3)] tabular">
                  {fmt(item.listeners)} listeners
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
