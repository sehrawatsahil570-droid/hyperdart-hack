import { describe, it, expect } from 'vitest';
import { compact, full, bytes, ratio, percent, date, shortDay, ago, list, plural } from '../src/frontend/lib/format.js';

describe('numbers', () => {
  it('compacts large numbers', () => {
    expect(compact(93967835)).toBe('94M');
    expect(compact(10082280)).toBe('10.1M');
    expect(compact(1234)).toBe('1.2k');
    expect(compact(999)).toBe('999');
    expect(compact(2.5e9)).toBe('2.5B');
    expect(compact(150000)).toBe('150k');
  });

  it('prints full numbers with separators', () => {
    expect(full(93967835)).toBe('93,967,835');
  });

  it('formats sizes in decimal units, like npm', () => {
    expect(bytes(512)).toBe('512 B');
    expect(bytes(1500)).toBe('1.5 kB');
    expect(bytes(76638)).toBe('77 kB');
    expect(bytes(2970996)).toBe('3.0 MB');
    expect(bytes(10902084)).toBe('11 MB');
  });

  it('formats ratios and percentages', () => {
    expect(ratio(9.33)).toBe('9.3×');
    expect(ratio(20.7)).toBe('21×');
    expect(percent(0.583)).toBe('58%');
    expect(percent(0.0051, 1)).toBe('0.5%');
  });

  it('returns a dash for missing values instead of NaN', () => {
    for (const fn of [compact, full, bytes, ratio, percent, date, shortDay, ago]) {
      expect(fn(null)).toBe('—');
      expect(fn(undefined)).toBe('—');
    }
    expect(compact(NaN)).toBe('—');
    expect(date('not a date')).toBe('—');
  });
});

describe('dates', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');

  it('formats dates in UTC', () => {
    expect(date('2026-10-09T23:59:00Z')).toBe('9 Oct 2026');
    expect(shortDay('2026-09-23')).toBe('23 Sep');
  });

  it.each([
    ['2026-10-26T08:00:00Z', 'today'],
    ['2026-10-25T08:00:00Z', 'yesterday'],
    ['2026-10-13T12:00:00Z', '13 days ago'],
    // Exactly 30 days used to print "0 months ago".
    ['2026-09-26T12:00:00Z', '1 month ago'],
    ['2026-05-21T12:00:00Z', '5 months ago'],
    ['2025-10-01T12:00:00Z', '1 year ago'],
    ['2020-02-11T12:00:00Z', '6 years ago'],
  ])('ago(%s) is "%s"', (iso, expected) => {
    expect(ago(iso, now)).toBe(expected);
  });
});

describe('text', () => {
  it('joins lists in plain English', () => {
    expect(list([])).toBe('');
    expect(list(['a'])).toBe('a');
    expect(list(['a', 'b'])).toBe('a and b');
    expect(list(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('pluralises', () => {
    expect(plural(1, 'file')).toBe('1 file');
    expect(plural(3, 'file')).toBe('3 files');
    expect(plural(2, 'dependency', 'dependencies')).toBe('2 dependencies');
  });
});
