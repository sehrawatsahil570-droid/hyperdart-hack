// Number, size and date formatting. Every function returns '—' for missing input
// so views never print "NaN" or "undefined".

const DASH = '—';

export function isNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/** 93967835 → "94.0M", 1234 → "1.2k", 999 → "999" */
export function compact(n) {
  if (!isNum(n)) return DASH;
  const abs = Math.abs(n);
  if (abs >= 1e9) return trim(n / 1e9) + 'B';
  if (abs >= 1e6) return trim(n / 1e6) + 'M';
  if (abs >= 1e3) return trim(n / 1e3) + 'k';
  return String(Math.round(n));
}

function trim(x) {
  return x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, '');
}

/** 93967835 → "93,967,835" */
export function full(n) {
  if (!isNum(n)) return DASH;
  return Math.round(n).toLocaleString('en-US');
}

/** Bytes in decimal units, the way npm reports unpacked size. */
export function bytes(n) {
  if (!isNum(n)) return DASH;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' MB';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + ' kB';
  return n + ' B';
}

/** A ratio such as 9.3 → "9.3×"; large ratios lose their decimal. */
export function ratio(x) {
  if (!isNum(x)) return DASH;
  return (x >= 10 ? Math.round(x).toLocaleString('en-US') : x.toFixed(1)) + '×';
}

export function percent(x, digits = 0) {
  if (!isNum(x)) return DASH;
  return (x * 100).toFixed(digits) + '%';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2025-03-31T…" → "31 Mar 2025" (UTC, so it matches the registry). */
export function date(v) {
  const d = toDate(v);
  if (!d) return DASH;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "2026-09-23" → "23 Sep" for chart axes. */
export function shortDay(v) {
  const d = toDate(v);
  if (!d) return DASH;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "3 days ago", "8 months ago", "2 years ago". */
export function ago(v, now = Date.now()) {
  const d = toDate(v);
  if (!d) return DASH;
  const days = Math.floor((now - d.getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.max(1, Math.floor(days / 30.44));
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365.25);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

export function daysSince(v, now = Date.now()) {
  const d = toDate(v);
  return d ? (now - d.getTime()) / 86400000 : null;
}

/** Joins ["a","b","c"] as "a, b and c". */
export function list(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

export function plural(n, word, pluralWord = word + 's') {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
