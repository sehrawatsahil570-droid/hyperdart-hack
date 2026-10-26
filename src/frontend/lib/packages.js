// Turns raw registry documents into the summaries the views render.
// Only the manifest is required; every other source is optional and recorded
// as a "gap" when it fails, so a view can say "unavailable" instead of breaking.

import {
  getManifest,
  getPackument,
  searchExact,
  getWeeklyDownloads,
  getDailyDownloads,
  getTypesPackage,
  getVersionDownloads,
} from './npm.js';

// ─── Package summary ────────────────────────────────────────────────────────

export async function loadPackage(name) {
  const manifest = await getManifest(name);
  const bundledTypes = hasBundledTypes(manifest);

  const [searchHit, weekly, daily, typesPkg] = await Promise.allSettled([
    searchExact(name),
    getWeeklyDownloads(name),
    getDailyDownloads(name),
    bundledTypes ? Promise.resolve(null) : getTypesPackage(name),
  ]);

  const gaps = [];
  const hit = searchHit.status === 'fulfilled' ? searchHit.value : null;
  if (!hit) gaps.push('search');

  let weeklyCount = null;
  let weeklySource = null;
  if (weekly.status === 'fulfilled') {
    weeklyCount = weekly.value;
    weeklySource = 'api';
  } else if (hit && hit.downloads && typeof hit.downloads.weekly === 'number') {
    weeklyCount = hit.downloads.weekly;
    weeklySource = 'search';
  } else {
    gaps.push('weekly');
  }

  const dailyData = daily.status === 'fulfilled' && daily.value.length ? markMissingDays(daily.value) : null;
  if (!dailyData) gaps.push('daily');
  // Both endpoints cover the same last 7 days, so outage days also undercount the weekly total.
  const weeklyMissingDays = weeklySource === 'api' && dailyData ? dailyData.slice(-7).filter((d) => d.missing).length : 0;

  // Search can lag a fresh publish, so its date only counts when the versions agree.
  let publishedAt = hit && hit.package.version === manifest.version ? hit.package.date : null;
  if (!publishedAt) {
    try {
      const packument = await getPackument(name);
      publishedAt = (packument.time && packument.time[manifest.version]) || null;
    } catch {
      gaps.push('publish date');
    }
  }

  let types;
  if (bundledTypes) types = { kind: 'bundled', label: 'Bundled' };
  else if (typesPkg.status === 'rejected') types = { kind: 'unknown', label: 'Unknown' };
  else if (typesPkg.value) types = { kind: 'definitelytyped', label: typesPkg.value.name, typesName: typesPkg.value.name };
  else types = { kind: 'none', label: 'None' };

  return {
    ...describeManifest(manifest),
    keywords: normalizeKeywords(manifest.keywords || (hit && hit.package.keywords)),
    dependents: hit ? Number(hit.dependents) || null : null,
    publishedAt,
    weekly: weeklyCount,
    weeklySource,
    weeklyMissingDays,
    daily: dailyData,
    types,
    gaps,
  };
}

/**
 * npm's daily counts contain outage days reported as 0 for every package. A zero on a
 * package that normally has steady traffic is marked `missing` so charts and trends skip
 * it instead of drawing a fake collapse. Small packages can genuinely have zero days.
 */
export function markMissingDays(days) {
  const nonZero = days.map((d) => d.downloads).filter((n) => n > 0).sort((a, b) => a - b);
  const median = nonZero.length ? nonZero[Math.floor(nonZero.length / 2)] : 0;
  return days.map((d) => ({ ...d, missing: d.downloads === 0 && median >= 50 }));
}

/** Facts that come straight from one version's manifest. */
export function describeManifest(m) {
  const deps = Object.keys(m.dependencies || {});
  const peers = Object.keys(m.peerDependencies || {});
  return {
    name: m.name,
    version: m.version,
    description: m.description || '',
    deprecated: typeof m.deprecated === 'string' && m.deprecated.trim() ? m.deprecated.trim() : m.deprecated === true ? 'This package is deprecated.' : null,
    license: licenseOf(m),
    homepage: cleanUrl(m.homepage),
    repoUrl: repoUrl(m.repository),
    npmUrl: `https://www.npmjs.com/package/${m.name}`,
    deps: deps.length,
    peerDeps: peers.length,
    unpackedSize: m.dist && typeof m.dist.unpackedSize === 'number' ? m.dist.unpackedSize : null,
    fileCount: m.dist && typeof m.dist.fileCount === 'number' ? m.dist.fileCount : null,
    node: (m.engines && typeof m.engines.node === 'string' && m.engines.node.trim()) || null,
    module: moduleFormat(m),
  };
}

function licenseOf(m) {
  if (typeof m.license === 'string') return m.license;
  if (m.license && typeof m.license.type === 'string') return m.license.type;
  if (Array.isArray(m.licenses) && m.licenses[0]) return m.licenses[0].type || null;
  return null;
}

function cleanUrl(u) {
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
}

/** "git+https://github.com/x/y.git", "github:x/y" or { url } → "https://github.com/x/y". */
export function repoUrl(repo) {
  let url = typeof repo === 'string' ? repo : repo && repo.url;
  if (typeof url !== 'string') return null;
  url = url.trim();
  const short = url.match(/^(github|gitlab|bitbucket):(.+)$/);
  if (short) return `https://${short[1]}.${short[1] === 'bitbucket' ? 'org' : 'com'}/${short[2]}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  url = url.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '');
  return cleanUrl(url);
}

function normalizeKeywords(k) {
  const list = Array.isArray(k) ? k : typeof k === 'string' ? k.split(/[,\s]+/) : [];
  return [...new Set(list.filter((x) => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter(Boolean))];
}

// ─── Module format and types ────────────────────────────────────────────────

function collectExports(node, conditions, files) {
  if (typeof node === 'string') files.push(node);
  else if (Array.isArray(node)) node.forEach((n) => collectExports(n, conditions, files));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (!key.startsWith('.')) conditions.add(key);
      collectExports(value, conditions, files);
    }
  }
}

/**
 * ESM / CommonJS / dual, as declared in package.json (type, exports, main, module).
 * This reads the declaration, not the shipped files.
 */
export function moduleFormat(m) {
  const conditions = new Set();
  const files = [];
  collectExports(m.exports, conditions, files);
  const isModuleType = m.type === 'module';

  const esmFile = files.some((f) => f.endsWith('.mjs')) || (isModuleType && files.some((f) => f.endsWith('.js')));
  const cjsFile = files.some((f) => f.endsWith('.cjs')) || (!isModuleType && files.some((f) => f.endsWith('.js')));
  const hasEsm = conditions.has('import') || conditions.has('module') || esmFile || typeof m.module === 'string' || isModuleType;
  const hasCjs = conditions.has('require') || cjsFile || (!isModuleType && (typeof m.main === 'string' || !m.exports));

  if (hasEsm && hasCjs) return { kind: 'dual', label: 'Dual (ESM + CJS)' };
  if (hasEsm) return { kind: 'esm', label: 'ESM only' };
  if (hasCjs) return { kind: 'cjs', label: 'CommonJS' };
  return { kind: 'unknown', label: 'Not declared' };
}

export function hasBundledTypes(m) {
  if (typeof m.types === 'string' || typeof m.typings === 'string') return true;
  const conditions = new Set();
  const files = [];
  collectExports(m.exports, conditions, files);
  return conditions.has('types') || files.some((f) => /\.d\.(c|m)?ts$/.test(f));
}

// ─── Versions ───────────────────────────────────────────────────────────────

export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v));
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || null, raw: v };
}

export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] - y[k];
  if (x.pre && !y.pre) return -1;
  if (!x.pre && y.pre) return 1;
  return (x.pre || '').localeCompare(y.pre || '', 'en', { numeric: true });
}

/** "4" → newest stable 4.x.x; "4.17" → newest 4.17.x; "4.17.1" → exact. */
export function resolveSpec(packument, spec) {
  const parts = String(spec).replace(/^[v@^~=]+/, '').split('.').filter(Boolean).map(Number);
  if (!parts.length || parts.some((n) => !Number.isInteger(n))) return null;
  const all = Object.keys(packument.versions || {}).map(parseVersion).filter(Boolean);
  const matching = all.filter((v) => ['major', 'minor', 'patch'].slice(0, parts.length).every((k, i) => v[k] === parts[i]));
  const stable = matching.filter((v) => !v.pre);
  const pool = stable.length ? stable : matching;
  if (!pool.length) return null;
  return pool.map((v) => v.raw).sort(compareVersions).pop();
}

/** Facts for one version, plus how active its release line (same major) still is. */
export function describeVersion(packument, version) {
  const m = packument.versions[version];
  const time = packument.time || {};
  const major = parseVersion(version).major;
  const lineVersions = Object.keys(packument.versions)
    .filter((v) => {
      const p = parseVersion(v);
      return p && p.major === major && !p.pre;
    })
    .sort(compareVersions);
  const lastInLine = lineVersions[lineVersions.length - 1] || version;
  const yearAgo = Date.now() - 365 * 86400000;
  const releasesLastYear = lineVersions.filter((v) => time[v] && new Date(time[v]).getTime() > yearAgo).length;

  return {
    ...describeManifest(m),
    spec: null,
    major,
    publishedAt: time[version] || null,
    types: hasBundledTypes(m) ? { kind: 'bundled', label: 'Bundled' } : { kind: 'none', label: 'Not bundled' },
    lastInLine,
    lastInLineAt: time[lastInLine] || null,
    releasesLastYear,
    isLatest: packument['dist-tags'] && packument['dist-tags'].latest === version,
  };
}

/** Most recent releases, newest first. */
export function releaseHistory(packument, count = 10) {
  const time = packument.time || {};
  const tags = packument['dist-tags'] || {};
  const tagsByVersion = {};
  for (const [tag, v] of Object.entries(tags)) (tagsByVersion[v] = tagsByVersion[v] || []).push(tag);
  return Object.keys(packument.versions || {})
    .filter((v) => time[v])
    .sort((a, b) => new Date(time[b]) - new Date(time[a]))
    .slice(0, count)
    .map((v) => ({
      version: v,
      publishedAt: time[v],
      tags: tagsByVersion[v] || [],
      deprecated: Boolean(packument.versions[v].deprecated),
      prerelease: Boolean(parseVersion(v) && parseVersion(v).pre),
    }));
}

/** Last week's downloads grouped by major version, largest first. */
export async function downloadsByMajor(name) {
  const perVersion = await getVersionDownloads(name);
  const byMajor = new Map();
  let total = 0;
  for (const [v, n] of Object.entries(perVersion)) {
    const p = parseVersion(v);
    if (!p || typeof n !== 'number') continue;
    byMajor.set(p.major, (byMajor.get(p.major) || 0) + n);
    total += n;
  }
  const rows = [...byMajor.entries()]
    .map(([major, downloads]) => ({ major, downloads, share: total ? downloads / total : 0 }))
    .sort((a, b) => b.downloads - a.downloads);
  return { rows, total };
}

export { getPackument };
