export const COUNTRY_NAMES: Record<string, string> = {
  AU: 'Australia',
  US: 'United States',
  IN: 'India',
  CA: 'Canada',
  UK: 'United Kingdom',
  DE: 'Germany',
};

// Fixed order: an action or device keeps its color under every filter, so readers never have to relearn the legend.
export const ACTIONS = [
  { key: 'play', label: 'Plays', color: 'var(--series-1)' },
  { key: 'pause', label: 'Pauses', color: 'var(--series-2)' },
  { key: 'add_to_playlist', label: 'Saves to playlist', color: 'var(--series-3)' },
  { key: 'skip', label: 'Skips', color: 'var(--series-4)' },
] as const;

export const DEVICES = [
  { key: 'desktop', label: 'Desktop app', color: 'var(--series-1)' },
  { key: 'mobile', label: 'Mobile', color: 'var(--series-2)' },
  { key: 'web', label: 'Web player', color: 'var(--series-3)' },
] as const;

export const actionLabel = (key: string) => ACTIONS.find((a) => a.key === key)?.label ?? key;
export const deviceLabel = (key: string) => DEVICES.find((d) => d.key === key)?.label ?? key;
export const countryLabel = (code: string) => COUNTRY_NAMES[code] ?? code;

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export const pct = (part: number, whole: number, digits = 0) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(digits)}%` : '0%';

export const hourLabel = (h: number, short = false) => {
  const suffix = h < 12 ? 'AM' : 'PM';
  const base = h % 12 === 0 ? 12 : h % 12;
  return short ? `${base}${suffix[0].toLowerCase()}` : `${base} ${suffix}`;
};

export const friendlyTimestamp = (raw?: string | null) => {
  if (!raw) return 'Unknown';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return raw;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]} UTC`;
};

// Largest-remainder rounding so the waffle always shows exactly 100 cells.
export const toHundredCells = (values: number[]) => {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const cells = raw.map(Math.floor);
  let left = 100 - cells.reduce((s, v) => s + v, 0);
  raw
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem)
    .forEach(({ i }) => {
      if (left > 0) {
        cells[i] += 1;
        left -= 1;
      }
    });
  return cells;
};
