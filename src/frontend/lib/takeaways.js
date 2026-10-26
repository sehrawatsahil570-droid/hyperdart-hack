// Factual comparison lines. Each line states a measured difference and is only
// produced when the underlying data exists for every package. No line picks a winner.

import { ratio, ago, bytes, list, isNum, percent, daysSince } from './format.js';

const SIMILAR = 1.1; // within 10% counts as "similar"

function allHave(pkgs, get) {
  return pkgs.every((p) => {
    const v = get(p);
    return v !== null && v !== undefined;
  });
}

function weeklyLine(pkgs) {
  if (!allHave(pkgs, (p) => p.weekly) || pkgs.some((p) => p.weekly <= 0)) return null;
  const sorted = [...pkgs].sort((a, b) => b.weekly - a.weekly);
  const [top, ...rest] = sorted;
  if (top.weekly / sorted[sorted.length - 1].weekly < SIMILAR) {
    return `Weekly downloads are within 10% of each other.`;
  }
  const parts = rest.map((p) => (top.weekly / p.weekly < SIMILAR ? `about the same as ${p.name}` : `${ratio(top.weekly / p.weekly)} the weekly downloads of ${p.name}`));
  return `${top.name} had ${list(parts)} last week.`;
}

function publishLine(pkgs) {
  if (!allHave(pkgs, (p) => p.publishedAt)) return null;
  const sorted = [...pkgs].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const newest = sorted[0];
  const oldest = sorted[sorted.length - 1];
  const gap = daysSince(oldest.publishedAt) - daysSince(newest.publishedAt);
  if (gap < 7) return `All were last published within the same week.`;
  return `${newest.name} was published most recently (${ago(newest.publishedAt)}); ${oldest.name}'s latest release is from ${ago(oldest.publishedAt)}.`;
}

function typesLine(pkgs) {
  if (pkgs.some((p) => !p.types || p.types.kind === 'unknown')) return null;
  const kinds = new Set(pkgs.map((p) => p.types.kind));
  if (kinds.size === 1) {
    const k = pkgs[0].types.kind;
    return k === 'bundled' ? 'All ship their own TypeScript types.' : k === 'none' ? 'None has TypeScript types available.' : 'All rely on @types packages for TypeScript.';
  }
  const by = (kind) => pkgs.filter((p) => p.types.kind === kind).map((p) => p.name);
  const parts = [];
  if (by('bundled').length) parts.push(`${list(by('bundled'))} ${by('bundled').length > 1 ? 'ship' : 'ships'} TypeScript types`);
  if (by('definitelytyped').length) parts.push(`${list(by('definitelytyped'))} ${by('definitelytyped').length > 1 ? 'rely' : 'relies'} on @types`);
  if (by('none').length) parts.push(`${list(by('none'))} ${by('none').length > 1 ? 'have' : 'has'} no types`);
  return parts.join('; ') + '.';
}

function moduleLine(pkgs) {
  if (pkgs.some((p) => p.module.kind === 'unknown')) return null;
  if (new Set(pkgs.map((p) => p.module.kind)).size === 1) return null;
  const phrase = { dual: 'dual ESM/CJS', esm: 'ESM-only', cjs: 'CommonJS' };
  return 'Module format differs: ' + pkgs.map((p) => `${p.name} is ${phrase[p.module.kind]}`).join(', ') + ' (as declared in package.json).';
}

function depsLine(pkgs) {
  if (new Set(pkgs.map((p) => p.deps)).size === 1) return `Each has ${pkgs[0].deps} direct dependencies.`;
  const sorted = [...pkgs].sort((a, b) => a.deps - b.deps);
  return 'Direct dependencies: ' + sorted.map((p) => `${p.name} ${p.deps}`).join(', ') + '.';
}

function sizeLine(pkgs) {
  if (!allHave(pkgs, (p) => p.unpackedSize)) return null;
  const sorted = [...pkgs].sort((a, b) => a.unpackedSize - b.unpackedSize);
  return 'Unpacked size (excl. deps): ' + sorted.map((p) => `${p.name} ${bytes(p.unpackedSize)}`).join(', ') + '.';
}

function nodeLine(pkgs) {
  if (!allHave(pkgs, (p) => p.node)) return null;
  if (new Set(pkgs.map((p) => p.node)).size === 1) return `All declare Node ${pkgs[0].node}.`;
  return 'Declared Node range: ' + pkgs.map((p) => `${p.name} ${p.node}`).join(', ') + '.';
}

/** Change from the first-week average to the last-week average of daily downloads. */
export function monthTrend(daily) {
  if (!daily || daily.length < 14) return null;
  const first = weekAverage(daily.slice(0, 7));
  const last = weekAverage(daily.slice(-7));
  return first && last !== null ? last / first - 1 : null;
}

/**
 * Average daily downloads over a full week, or null when any day is missing:
 * a partial week skews the weekday/weekend mix and would invent a trend.
 */
export function weekAverage(days) {
  const reported = days.filter((d) => !d.missing);
  if (days.length < 7 || reported.length < days.length) return null;
  return reported.reduce((s, d) => s + d.downloads, 0) / reported.length;
}

function trendLine(pkgs) {
  const trends = pkgs.map((p) => monthTrend(p.daily));
  if (!trends.every(isNum)) return null;
  const parts = pkgs.map((p, i) => {
    const t = trends[i];
    if (Math.abs(t) < 0.02) return `${p.name} held steady`;
    return `${p.name} ${t > 0 ? 'rose' : 'fell'} ${percent(Math.abs(t))}`;
  });
  return `Over the last 30 days (first week vs last week): ${list(parts)}.`;
}

function deprecatedLine(pkgs) {
  const dep = pkgs.filter((p) => p.deprecated);
  if (!dep.length) return null;
  return `${list(dep.map((p) => p.name))} ${dep.length > 1 ? 'are' : 'is'} deprecated on npm.`;
}

export function compareTakeaways(pkgs) {
  return [deprecatedLine, weeklyLine, publishLine, typesLine, moduleLine, sizeLine, depsLine, nodeLine, trendLine]
    .map((fn) => fn(pkgs))
    .filter(Boolean);
}

/** Lines for two or more versions of one package. */
export function versionTakeaways(versions) {
  const lines = [];
  const [a, b] = versions;
  if (!a || !b) return lines;
  if (a.publishedAt && b.publishedAt) {
    const [older, newer] = new Date(a.publishedAt) < new Date(b.publishedAt) ? [a, b] : [b, a];
    lines.push(`${newer.version} was released ${ago(newer.publishedAt)}; ${older.version} ${ago(older.publishedAt)}.`);
  }
  if (a.node !== b.node) lines.push(`Declared Node range: ${a.version} ${a.node || 'none'}, ${b.version} ${b.node || 'none'}.`);
  if (a.deps !== b.deps) lines.push(`Direct dependencies: ${a.version} has ${a.deps}, ${b.version} has ${b.deps}.`);
  if (a.module.kind !== b.module.kind) lines.push(`Module format: ${a.version} is ${a.module.label}, ${b.version} is ${b.module.label}.`);
  if (a.types.kind !== b.types.kind) lines.push(`TypeScript types: ${a.version} ${a.types.kind === 'bundled' ? 'bundles them' : 'does not bundle them'}, ${b.version} ${b.types.kind === 'bundled' ? 'bundles them' : 'does not bundle them'}.`);
  for (const v of versions) {
    if (v.lastInLine && !v.isLatest && v.lastInLineAt) {
      lines.push(`The ${v.major}.x line last shipped ${v.lastInLine} ${ago(v.lastInLineAt)} (${v.releasesLastYear} release${v.releasesLastYear === 1 ? '' : 's'} in the past year).`);
    }
  }
  return lines;
}
