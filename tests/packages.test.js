import { describe, it, expect } from 'vitest';
import {
  moduleFormat,
  hasBundledTypes,
  repoUrl,
  describeManifest,
  markMissingDays,
  parseVersion,
  compareVersions,
  resolveSpec,
  describeVersion,
  releaseHistory,
} from '../src/frontend/lib/packages.js';

describe('moduleFormat (as declared in package.json)', () => {
  it.each([
    ['plain main', { main: 'index.js' }, 'cjs'],
    ['nothing declared', {}, 'cjs'],
    ['type: module', { type: 'module', main: 'index.js' }, 'esm'],
    ['import + require conditions', { exports: { import: './a.mjs', require: './a.cjs' } }, 'dual'],
    ['main + module field', { main: 'index.js', module: 'index.esm.js' }, 'dual'],
    ['type: module with a .cjs export', { type: 'module', exports: { '.': { import: './i.js', require: './i.cjs' } } }, 'dual'],
    ['string export, no type', { exports: './index.js' }, 'cjs'],
    ['.mjs-only export', { exports: { '.': './index.mjs' } }, 'esm'],
  ])('%s → %s', (_, manifest, kind) => {
    expect(moduleFormat(manifest).kind).toBe(kind);
  });
});

describe('hasBundledTypes', () => {
  it('detects types, typings, a types condition or a .d.ts export', () => {
    expect(hasBundledTypes({ types: 'index.d.ts' })).toBe(true);
    expect(hasBundledTypes({ typings: 'index.d.ts' })).toBe(true);
    expect(hasBundledTypes({ exports: { '.': { types: './i.d.ts', default: './i.js' } } })).toBe(true);
    expect(hasBundledTypes({ exports: { './types': './dist/index.d.mts' } })).toBe(true);
    expect(hasBundledTypes({ main: 'index.js' })).toBe(false);
  });
});

describe('repoUrl', () => {
  it.each([
    ['git+https://github.com/expressjs/express.git', 'https://github.com/expressjs/express'],
    ['github:moment/moment', 'https://github.com/moment/moment'],
    ['gitlab:a/b', 'https://gitlab.com/a/b'],
    ['moment/moment', 'https://github.com/moment/moment'],
    ['git://github.com/x/y.git', 'https://github.com/x/y'],
    [{ url: 'git@github.com:x/y.git' }, 'https://github.com/x/y'],
    [null, null],
    ['not a url', null],
  ])('%j → %s', (input, expected) => {
    expect(repoUrl(input)).toBe(expected);
  });
});

describe('describeManifest', () => {
  it('summarises one manifest', () => {
    const s = describeManifest({
      name: 'x',
      version: '1.2.3',
      license: { type: 'MIT' },
      dependencies: { a: '1', b: '1' },
      peerDependencies: { react: '*' },
      engines: { node: '>= 18' },
      dist: { unpackedSize: 1234, fileCount: 5 },
    });
    expect(s).toMatchObject({ name: 'x', version: '1.2.3', license: 'MIT', deps: 2, peerDeps: 1, node: '>= 18', unpackedSize: 1234, fileCount: 5, deprecated: null });
    expect(s.npmUrl).toBe('https://www.npmjs.com/package/x');
  });

  it('keeps the deprecation message, or a generic one for `deprecated: true`', () => {
    expect(describeManifest({ name: 'r', deprecated: ' request has been deprecated ' }).deprecated).toBe('request has been deprecated');
    expect(describeManifest({ name: 'r', deprecated: true }).deprecated).toBe('This package is deprecated.');
  });

  it('reports missing size as null rather than 0', () => {
    expect(describeManifest({ name: 'x' }).unpackedSize).toBeNull();
  });
});

describe('markMissingDays', () => {
  it('treats zero days on a busy package as missing (npm outage)', () => {
    const days = [100, 0, 120, 0, 110].map((downloads, i) => ({ day: `d${i}`, downloads }));
    expect(markMissingDays(days).map((d) => d.missing)).toEqual([false, true, false, true, false]);
  });

  it('keeps genuine zero days on a tiny package', () => {
    const days = [0, 1, 0, 2, 3].map((downloads, i) => ({ day: `d${i}`, downloads }));
    expect(markMissingDays(days).some((d) => d.missing)).toBe(false);
  });
});

describe('versions', () => {
  const packument = {
    'dist-tags': { latest: '5.1.0', next: '6.0.0-rc.1' },
    versions: Object.fromEntries(
      ['4.17.0', '4.21.2', '4.22.0-beta.1', '5.0.0', '5.1.0', '6.0.0-rc.1'].map((v) => [
        v,
        { name: 'demo', version: v, dependencies: v.startsWith('4') ? { a: '1', b: '1' } : { a: '1' }, engines: { node: v.startsWith('4') ? '>= 0.10' : '>= 18' } },
      ]),
    ),
    time: {
      '4.17.0': '2019-01-01T00:00:00Z',
      '4.21.2': '2026-09-14T00:00:00Z',
      '4.22.0-beta.1': '2026-09-20T00:00:00Z',
      '5.0.0': '2025-03-31T00:00:00Z',
      '5.1.0': '2026-10-09T00:00:00Z',
      '6.0.0-rc.1': '2026-10-20T00:00:00Z',
    },
  };

  it('parses and orders versions, pre-releases before the release', () => {
    expect(parseVersion('v1.2.3-beta.1')).toMatchObject({ major: 1, minor: 2, patch: 3, pre: 'beta.1' });
    expect(parseVersion('nope')).toBeNull();
    expect(['5.0.0', '4.21.2', '5.0.0-rc.1', '4.3.0'].sort(compareVersions)).toEqual(['4.3.0', '4.21.2', '5.0.0-rc.1', '5.0.0']);
  });

  it.each([
    ['4', '4.21.2'],
    ['v5', '5.1.0'],
    ['4.17', '4.17.0'],
    ['5.0.0', '5.0.0'],
    ['6', '6.0.0-rc.1'], // only a pre-release exists
    ['7', null],
    ['abc', null],
  ])('resolveSpec(%s) → %s', (spec, expected) => {
    expect(resolveSpec(packument, spec)).toBe(expected);
  });

  it('describes a version and its release line', () => {
    const v4 = describeVersion(packument, '4.21.2');
    expect(v4).toMatchObject({ version: '4.21.2', major: 4, deps: 2, node: '>= 0.10', lastInLine: '4.21.2', isLatest: false, publishedAt: '2026-09-14T00:00:00Z' });
    expect(describeVersion(packument, '5.1.0').isLatest).toBe(true);
  });

  it('lists recent releases newest first with their dist-tags', () => {
    const h = releaseHistory(packument, 3);
    expect(h.map((r) => r.version)).toEqual(['6.0.0-rc.1', '5.1.0', '4.22.0-beta.1']);
    expect(h[0]).toMatchObject({ tags: ['next'], prerelease: true });
    expect(h[1].tags).toEqual(['latest']);
  });
});
