// Alternatives and use-case search. Both return the rule that produced the list
// so the UI can print it next to the results.

import { search, getManifest } from './npm.js';

const GENERIC_KEYWORDS = new Set(`
  javascript js node nodejs node.js npm library lib module modules package typescript ts es6 es2015 esm
  commonjs cjs browser web client server frontend backend front-end back-end util utils utility utilities
  tool tools helper helpers simple fast lightweight small tiny minimal plugin api framework core app
  isomorphic universal react-native deno bun hacktoberfest
`.trim().split(/\s+/));

export const MIN_WEEKLY = 1000;
const MIN_SHARE = 0.0005; // 0.05% of the subject's weekly downloads
const SHOWN = 10;

// ─── Alternatives ───────────────────────────────────────────────────────────

/**
 * Keywords that describe what the package does. Keywords that also appear in the
 * description come first, because keyword lists are often alphabetical. A generic
 * keyword is kept when the description uses it ("web framework" for express).
 */
export function pickKeywords(subject) {
  const desc = (subject.description || '').toLowerCase();
  const own = subject.name.toLowerCase();
  const candidates = subject.keywords.filter((k) => k !== own && k.length > 1);
  const inDesc = candidates.filter((k) => mentions(desc, k));
  const rest = candidates.filter((k) => !inDesc.includes(k) && !GENERIC_KEYWORDS.has(k));
  return [...inDesc, ...rest];
}

/** Whole-word mention, allowing a plural: "dates" mentions "date", "utilities" does not mention "util". */
function mentions(text, word) {
  return new RegExp(`\\b${escapeRe(word)}(s|es)?\\b`).test(text);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scopeOf(name) {
  return name.startsWith('@') ? name.split('/')[0] : null;
}

// Add-ons for some other library ("jalali-plugin-dayjs", "handlebars-helpers") are not alternatives.
const ADD_ON = /\b(plugins?|helpers|adapters?|loader|preset|bindings?)\b/i;

/**
 * Plugins and companions: moment-timezone, @types/moment, react-moment, the subject's
 * own scope, and add-ons whose name or description says they extend something else.
 */
export function isCompanion(candidate, subject, description = '') {
  if (candidate === subject) return true;
  if (candidate.startsWith('@types/')) return true;
  if (ADD_ON.test(candidate.replace(/[-_/]/g, ' ')) || ADD_ON.test(description.split(/[.,;]/)[0])) return true;
  const scope = scopeOf(subject);
  if (scope && scopeOf(candidate) === scope) return true;
  const bare = subject.replace(/^@[^/]+\//, '');
  return new RegExp(`(^|[-/.])${escapeRe(bare)}([-./]|$)`).test(candidate);
}

function toCandidate(o) {
  const p = o.package;
  return {
    name: p.name,
    version: p.version,
    description: p.description || '',
    keywords: [...new Set((p.keywords || []).map((k) => String(k).toLowerCase()))],
    weekly: o.downloads && typeof o.downloads.weekly === 'number' ? o.downloads.weekly : null,
    publishedAt: p.date || null,
    deprecated: null,
  };
}

async function searchMany(queries) {
  const results = await Promise.allSettled(queries.map((q) => search(q, 50)));
  const ok = results.filter((r) => r.status === 'fulfilled');
  if (!ok.length) throw results[0].reason;
  const byName = new Map();
  ok.forEach((r) => r.value.forEach((o) => o.package && !byName.has(o.package.name) && byName.set(o.package.name, o)));
  return { objects: [...byName.values()], failed: results.length - ok.length };
}

/** npm search omits deprecation, so check the manifests of the packages we show. */
async function markDeprecated(items) {
  const manifests = await Promise.allSettled(items.map((c) => getManifest(c.name)));
  manifests.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.deprecated) items[i].deprecated = String(r.value.deprecated);
  });
}

/**
 * @param subject a package summary from loadPackage()
 */
export async function findAlternatives(subject) {
  const keywords = pickKeywords(subject);
  const top = keywords.slice(0, 3);
  if (!top.length) {
    return { items: [], keywords: [], required: 0, hidden: 0, considered: 0, failedQueries: 0, reason: 'no-keywords' };
  }

  // One search per keyword: npm orders single-keyword results by popularity, which
  // surfaces established packages; the shared-keyword filter below does the matching.
  const queries = [...top.map((k) => `keywords:${k}`), `keywords:${subject.name}`];
  const { objects, failed } = await searchMany(queries);

  const subjectSet = new Set(keywords);
  const required = keywords.length < 3 ? 1 : 2;
  // The first keyword the description uses names the package's core concept; every match must share it.
  const desc = (subject.description || '').toLowerCase();
  const primary = keywords.find((k) => mentions(desc, k)) || null;
  let hidden = 0;
  const floor = Math.max(MIN_WEEKLY, (subject.weekly || 0) * MIN_SHARE);

  const matches = [];
  for (const o of objects) {
    const c = toCandidate(o);
    if (isCompanion(c.name, subject.name, c.description)) continue;
    const shared = c.keywords.filter((k) => subjectSet.has(k));
    // Listing the subject's name as a keyword counts once, not as an automatic pass:
    // middleware does it too.
    if (c.keywords.includes(subject.name)) shared.push(subject.name);
    if (shared.length < required || (primary && !shared.includes(primary))) continue;
    if (c.weekly === null || c.weekly < floor) {
      hidden++;
      continue;
    }
    matches.push({ ...c, shared });
  }

  matches.sort((a, b) => b.weekly - a.weekly);
  // One package per scope: a family like @date-io/* is a set of adapters, not separate choices.
  const scopesSeen = new Set();
  let sameScope = 0;
  const items = matches
    .filter((c) => {
      const scope = scopeOf(c.name);
      if (!scope) return true;
      if (scopesSeen.has(scope)) return (sameScope++, false);
      return scopesSeen.add(scope);
    })
    .slice(0, SHOWN);
  await markDeprecated(items);
  items.sort((a, b) => Number(Boolean(a.deprecated)) - Number(Boolean(b.deprecated)));

  return { items, keywords: top, primary, required, hidden, sameScope, considered: matches.length + hidden, floor, failedQueries: failed, reason: null };
}

// ─── Use case ───────────────────────────────────────────────────────────────

function matchesTerm(c, term) {
  const root = term.length > 4 ? term.replace(/e$/, '') : term;
  const hay = `${c.name} ${c.description} ${c.keywords.join(' ')}`.toLowerCase();
  return hay.includes(root);
}

/**
 * Finds packages for a task such as ["parse", "csv"]. Keeps packages whose name,
 * description or keywords contain every term, sorted by weekly downloads; falls back
 * to npm's relevance order when fewer than three match every term.
 */
export async function findForUseCase(terms) {
  const text = terms.join(' ');
  const { objects, failed } = await searchMany([text, terms.map((t) => `keywords:${t}`).join(' ')]);
  const relevance = objects.map(toCandidate);

  let hidden = 0;
  const visible = relevance.filter((c) => {
    if (c.weekly !== null && c.weekly >= MIN_WEEKLY) return true;
    hidden++;
    return false;
  });

  const all = visible.filter((c) => terms.every((t) => matchesTerm(c, t)));
  const relaxed = all.length < 3;
  const ranked = relaxed ? visible : [...all].sort((a, b) => b.weekly - a.weekly);
  const items = ranked.slice(0, SHOWN).map((c) => ({ ...c, shared: terms.filter((t) => matchesTerm(c, t)) }));
  await markDeprecated(items);
  items.sort((a, b) => Number(Boolean(a.deprecated)) - Number(Boolean(b.deprecated)));

  return { items, terms, relaxed, hidden, matchedAll: all.length, failedQueries: failed };
}
