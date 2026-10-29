'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

export function useElementWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.floor(el.getBoundingClientRect().width)));
    // Measure before first paint so charts never flash at the fallback width.
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return { ref, width };
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] ${className}`}
    >
      {children}
    </section>
  );
}

export interface TableSpec {
  columns: string[];
  rows: (string | number)[][];
  numeric?: number[];
}

export function ChartCard({
  title,
  headline,
  action,
  table,
  children,
  footer,
  className = '',
}: {
  title: string;
  headline?: React.ReactNode;
  action?: React.ReactNode;
  table?: TableSpec;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card className={`flex min-w-0 flex-col p-5 ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium text-[var(--ink-2)]">{title}</h2>
          {headline && <p className="mt-1 text-[17px] font-semibold leading-snug text-[var(--ink)]">{headline}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
              aria-pressed={showTable}
              title={showTable ? 'Show chart' : 'Show as table'}
            >
              {showTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              {showTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </header>
      <div className="mt-4 min-w-0 flex-1">{showTable && table ? <DataTable spec={table} /> : children}</div>
      {footer && <div className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--ink-3)]">{footer}</div>}
    </Card>
  );
}

export function DataTable({ spec }: { spec: TableSpec }) {
  const numeric = new Set(spec.numeric ?? spec.columns.map((_, i) => i).slice(1));
  return (
    <div className="max-h-[360px] overflow-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-[var(--surface-sunken)] text-xs text-[var(--ink-2)]">
          <tr>
            {spec.columns.map((c, i) => (
              <th key={c} className={`px-3 py-2 font-medium ${numeric.has(i) ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {spec.rows.map((row, r) => (
            <tr key={r} className="border-t border-[var(--border)]">
              {row.map((cell, i) => (
                <td key={i} className={`px-3 py-2 ${numeric.has(i) ? 'text-right' : ''} ${i === 0 ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
                  {typeof cell === 'number' ? cell.toLocaleString('en-US') : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartTooltip({
  x,
  y,
  containerWidth,
  children,
}: {
  x: number;
  y: number;
  containerWidth: number;
  children: React.ReactNode;
}) {
  const flip = x > containerWidth - 170;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 min-w-[140px] rounded-lg bg-[var(--tooltip-bg)] px-3 py-2 text-xs text-[var(--tooltip-ink)] shadow-lg"
      style={{
        left: x,
        top: y,
        transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
      }}
    >
      {children}
    </div>
  );
}

export function TooltipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 opacity-80">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg bg-[var(--surface-sunken)] p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`h-7 shrink-0 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors ${
              active
                ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--border)]'
                : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] text-sm text-[var(--ink-3)]">
      {message}
    </div>
  );
}
