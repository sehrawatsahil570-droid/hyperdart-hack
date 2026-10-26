import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { compareTakeaways, versionTakeaways, monthTrend, weekAverage } from '../src/frontend/lib/takeaways.js';

const types = {
  bundled: { kind: 'bundled', label: 'Bundled' },
  at: (n) => ({ kind: 'definitelytyped', label: `@types/${n}` }),
};
const cjs = { kind: 'cjs', label: 'CommonJS' };
const dual = { kind: 'dual', label: 'Dual (ESM + CJS)' };

// Real numbers from the registry on 26 Oct 2026.
const express = { name: 'express', weekly: 93967835, publishedAt: '2026-10-09T12:56:54Z', types: types.at('express'), module: cjs, deps: 28, unpackedSize: 76638, node: '>= 18', daily: null, deprecated: null };
const fastify = { name: 'fastify', weekly: 10082280, publishedAt: '2026-10-13T08:07:53Z', types: types.bundled, module: cjs, deps: 15, unpackedSize: 2970996, node: null, daily: null, deprecated: null };
const koa = { name: 'koa', weekly: 4567786, publishedAt: '2026-05-21T07:25:34Z', types: types.at('koa'), module: dual, deps: 18, unpackedSize: 65032, node: '>= 18', daily: null, deprecated: null };

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
});
afterAll(() => vi.useRealTimers());

describe('compareTakeaways', () => {
  it('states measured differences for express, fastify and koa', () => {
    expect(compareTakeaways([express, fastify, koa])).toEqual([
      'express had 9.3× the weekly downloads of fastify and 21× the weekly downloads of koa last week.',
      "fastify was published most recently (13 days ago); koa's latest release is from 5 months ago.",
      'fastify ships TypeScript types; express and koa rely on @types.',
      'Module format differs: express is CommonJS, fastify is CommonJS, koa is dual ESM/CJS (as declared in package.json).',
      'Unpacked size (excl. deps): koa 65 kB, express 77 kB, fastify 3.0 MB.',
      'Direct dependencies: fastify 15, koa 18, express 28.',
    ]);
  });

  it('never names a winner', () => {
    const text = compareTakeaways([express, fastify, koa]).join(' ').toLowerCase();
    for (const word of ['best', 'winner', 'better', 'recommend']) expect(text).not.toContain(word);
  });

  it('drops a line when any package lacks the data', () => {
    const lines = compareTakeaways([express, { ...fastify, weekly: null, unpackedSize: null }]);
    expect(lines.some((l) => l.includes('weekly downloads'))).toBe(false);
    expect(lines.some((l) => l.startsWith('Unpacked size'))).toBe(false);
    // fastify declares no Node range, so there is no Node line either.
    expect(lines.some((l) => l.startsWith('Declared Node'))).toBe(false);
  });

  it('calls near-equal downloads similar instead of computing a ratio', () => {
    expect(compareTakeaways([express, { ...koa, weekly: express.weekly * 0.95 }])[0]).toBe('Weekly downloads are within 10% of each other.');
  });

  it('leads with deprecation', () => {
    expect(compareTakeaways([express, { ...koa, name: 'request', deprecated: 'use something else' }])[0]).toBe('request is deprecated on npm.');
  });
});

describe('monthTrend', () => {
  const month = (first, last, missingAt = -1) =>
    Array.from({ length: 30 }, (_, i) => ({ day: `d${i}`, downloads: i < 7 ? first : last, missing: i === missingAt }));

  it('compares the first full week with the last full week', () => {
    expect(monthTrend(month(100, 110))).toBeCloseTo(0.1);
  });

  it('returns null when a week has a missing day, instead of inventing a trend', () => {
    expect(monthTrend(month(100, 110, 28))).toBeNull();
    expect(weekAverage(month(100, 110, 2).slice(0, 7))).toBeNull();
  });

  it('returns null for short or absent history', () => {
    expect(monthTrend(null)).toBeNull();
    expect(monthTrend(month(1, 1).slice(0, 10))).toBeNull();
  });
});

describe('versionTakeaways', () => {
  it('describes the differences between two versions', () => {
    const v4 = { version: '4.22.3', major: 4, publishedAt: '2026-09-14T00:00:00Z', node: '>= 0.10.0', deps: 31, module: cjs, types: { kind: 'none' }, isLatest: false, lastInLine: '4.22.3', lastInLineAt: '2026-09-14T00:00:00Z', releasesLastYear: 4 };
    const v5 = { version: '5.3.0', major: 5, publishedAt: '2026-10-09T00:00:00Z', node: '>= 18', deps: 28, module: cjs, types: { kind: 'none' }, isLatest: true, lastInLine: '5.3.0', lastInLineAt: '2026-10-09T00:00:00Z', releasesLastYear: 3 };
    expect(versionTakeaways([v4, v5])).toEqual([
      '5.3.0 was released 17 days ago; 4.22.3 1 month ago.',
      'Declared Node range: 4.22.3 >= 0.10.0, 5.3.0 >= 18.',
      'Direct dependencies: 4.22.3 has 31, 5.3.0 has 28.',
      'The 4.x line last shipped 4.22.3 1 month ago (4 releases in the past year).',
    ]);
  });

  it('needs two versions', () => {
    expect(versionTakeaways([])).toEqual([]);
  });
});
