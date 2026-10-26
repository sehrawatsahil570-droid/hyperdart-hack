import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/frontend/lib/npm.js', () => ({ search: vi.fn(), getManifest: vi.fn() }));

import { search, getManifest } from '../src/frontend/lib/npm.js';
import { pickKeywords, isCompanion, findAlternatives, findForUseCase } from '../src/frontend/lib/discover.js';

/** A search hit shaped like registry.npmjs.org/-/v1/search objects. */
const hit = (name, keywords, weekly, description = '') => ({
  package: { name, keywords, description, version: '1.0.0', date: '2026-01-01T00:00:00Z' },
  downloads: { weekly },
});

beforeEach(() => {
  vi.mocked(search).mockReset();
  vi.mocked(getManifest).mockReset().mockResolvedValue({});
});

describe('pickKeywords', () => {
  it('puts keywords the description uses first and drops generic ones', () => {
    const moment = { name: 'moment', description: 'Parse, validate, manipulate, and display dates', keywords: ['moment', 'date', 'time', 'i18n', 'javascript'] };
    expect(pickKeywords(moment)).toEqual(['date', 'time', 'i18n']);
  });

  it('keeps a generic keyword when the description uses it', () => {
    const express = { name: 'express', description: 'Fast, unopinionated, minimalist web framework', keywords: ['express', 'framework', 'sinatra', 'web', 'http'] };
    expect(pickKeywords(express)).toEqual(['framework', 'web', 'sinatra', 'http']);
  });

  it('matches whole words only ("utilities" does not mention "util")', () => {
    const lodash = { name: 'lodash', description: 'Lodash modular utilities.', keywords: ['modules', 'stdlib', 'util'] };
    expect(pickKeywords(lodash)).toEqual(['stdlib']);
  });
});

describe('isCompanion', () => {
  it.each([
    ['moment-timezone', 'moment', '', true],
    ['react-moment', 'moment', '', true],
    ['@types/moment', 'moment', '', true],
    ['@optimize-lodash/transform', 'lodash', '', true],
    ['@babel/parser', '@babel/core', '', true],
    ['jalali-plugin-dayjs', 'moment', '', true],
    ['handlebars-helpers', 'moment', '', true],
    ['luxon', 'moment', 'Immutable date wrapper', false],
    ['dayjs', 'moment', '2KB alternative to Moment.js', false],
    ['momentum', 'moment', '', false],
  ])('%s vs %s → %s', (candidate, subject, description, expected) => {
    expect(isCompanion(candidate, subject, description)).toBe(expected);
  });
});

describe('findAlternatives', () => {
  const moment = { name: 'moment', description: 'Parse, validate, manipulate, and display dates', keywords: ['moment', 'date', 'time', 'i18n', 'l10n'], weekly: 24_000_000 };

  it('filters, hides the long tail, keeps one per scope and ranks by downloads', async () => {
    vi.mocked(search).mockResolvedValue([
      hit('dayjs', ['date', 'time', 'moment'], 44_000_000),
      hit('moment-timezone', ['date', 'time'], 10_000_000), // companion
      hit('jalali-plugin-dayjs', ['date', 'time'], 40_000), // add-on
      hit('i18next', ['i18n', 'time'], 9_000_000), // lacks the primary keyword "date"
      hit('luxon', ['date', 'immutable'], 26_000_000), // only one shared keyword
      hit('tiny-date', ['date', 'time'], 500), // long tail
      hit('@date-io/core', ['date', 'time'], 846_000),
      hit('@date-io/dayjs', ['date', 'time'], 300_000), // same scope as the one above
      hit('old-date', ['date', 'time'], 5_000_000),
    ]);
    vi.mocked(getManifest).mockImplementation(async (name) => (name === 'old-date' ? { deprecated: 'use dayjs' } : {}));

    const r = await findAlternatives(moment);

    expect(search.mock.calls.map((c) => c[0])).toEqual(['keywords:date', 'keywords:time', 'keywords:i18n', 'keywords:moment']);
    expect(r.items.map((i) => i.name)).toEqual(['dayjs', '@date-io/core', 'old-date']); // deprecated last
    expect(r.items[2].deprecated).toBe('use dayjs');
    expect(r.items[0].shared).toEqual(['date', 'time', 'moment']);
    expect(r).toMatchObject({ keywords: ['date', 'time', 'i18n'], primary: 'date', required: 2, hidden: 1, sameScope: 1, floor: 12_000 });
  });

  it('still answers when some searches fail, and says so', async () => {
    vi.mocked(search).mockRejectedValueOnce(new Error('429')).mockResolvedValue([hit('dayjs', ['date', 'time'], 44_000_000)]);
    const r = await findAlternatives(moment);
    expect(r.items.map((i) => i.name)).toEqual(['dayjs']);
    expect(r.failedQueries).toBe(1);
  });

  it('throws when every search fails', async () => {
    vi.mocked(search).mockRejectedValue(Object.assign(new Error('rate limited'), { type: 'rate-limited' }));
    await expect(findAlternatives(moment)).rejects.toMatchObject({ type: 'rate-limited' });
  });

  it('reports a package with no descriptive keywords instead of guessing', async () => {
    const r = await findAlternatives({ name: 'react', description: 'React is a JavaScript library for building user interfaces.', keywords: ['react'], weekly: 1 });
    expect(r).toMatchObject({ items: [], reason: 'no-keywords' });
    expect(search).not.toHaveBeenCalled();
  });
});

describe('findForUseCase', () => {
  it('keeps packages matching every term, sorted by weekly downloads', async () => {
    vi.mocked(search).mockResolvedValue([
      hit('papaparse', ['csv'], 10_900_000, 'Fast and powerful CSV parser'),
      hit('csv-parse', ['csv', 'parser'], 11_600_000, 'CSV parsing'),
      hit('fast-csv', ['csv'], 11_500_000, 'CSV parser and writer'),
      hit('json2csv', ['csv', 'json'], 1_100_000, 'Convert JSON to CSV'), // no "parse"
      hit('tiny-csv-parser', ['csv'], 200, 'csv parser'), // long tail
    ]);
    const r = await findForUseCase(['parse', 'csv']);
    expect(r.items.map((i) => i.name)).toEqual(['csv-parse', 'fast-csv', 'papaparse']);
    expect(r).toMatchObject({ relaxed: false, matchedAll: 3, hidden: 1 });
  });

  it("falls back to npm's relevance order when fewer than three match every term", async () => {
    vi.mocked(search).mockResolvedValue([
      hit('json2csv', ['csv'], 1_100_000, 'Convert JSON to CSV'),
      hit('csv-parse', ['csv'], 11_600_000, 'CSV parsing'),
    ]);
    const r = await findForUseCase(['parse', 'csv']);
    expect(r.relaxed).toBe(true);
    expect(r.items.map((i) => i.name)).toEqual(['json2csv', 'csv-parse']);
  });
});
