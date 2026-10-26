// Works out what the user is asking from the query text and the platform's entities.
// searchData names the packages but not the intent, so the intent comes from
// INTENT_RULES below: the first rule whose test passes wins.

// ─── Vocabulary ─────────────────────────────────────────────────────────────

const ALTERNATIVES_CUE = /\b(alternatives?|similar( to)?|(packages?|libraries|libs?|modules?) like|replace(ments?|s)?|instead of|substitutes?|competitors?|other than)\b/;
const COMPARE_CUE = /\b(compare|comparison|vs\.?|versus|difference|differences|between)\b/;
const LATEST_CUE = /\b(latest|current|newest|most recent|last)\b|\bversion\b/;
const INSTALL_CUE = /\b(size|sizes|weight|heavy|light|install cost|bundle|typescript|ts|types|typed|esm|cjs|commonjs|es ?modules?|module format|node( ?js)?( versions?)?|engines?|compatib\w*|supports?)\b/;
// "library for parsing csv", "best package for dates": the user describes a task.
const USE_CASE_CUE = /\b(packages?|librar(y|ies)|libs?|modules?|tools?)\s+(for|to|that)\b|\b(best|top|recommended?|good)\b/;

/**
 * Ordered rules. Each test receives { q, rest, names, specs, terms }, where `rest`
 * is the query with the package names removed (so "node-fetch" never reads as "node").
 * To support a new wording, add or extend one line here.
 */
export const INTENT_RULES = [
  { intent: 'alternatives', test: ({ rest, names }) => names.length >= 1 && ALTERNATIVES_CUE.test(rest) },
  { intent: 'versions', test: ({ names, specs }) => names.length === 1 && specs.length >= 1 },
  { intent: 'compare', test: ({ rest, names }) => names.length >= 2 || (names.length === 1 && COMPARE_CUE.test(rest)) },
  { intent: 'latest', test: ({ rest, names }) => names.length === 1 && LATEST_CUE.test(rest) },
  { intent: 'install', test: ({ rest, names }) => names.length === 1 && INSTALL_CUE.test(rest) },
  { intent: 'details', test: ({ names }) => names.length >= 1 },
  { intent: 'usecase', test: ({ names, terms }) => names.length === 0 && terms.length > 0 },
];

// Words that are never package names in a query. Also used to strip filler from use-case terms.
const STOPWORDS = new Set(`
  npm npmjs package packages pkg info information details detail about compare comparison vs versus and or with
  to for of the a an latest current newest most recent last version versions alternative alternatives similar
  like replace replacement replacements instead other than substitute substitutes competitor competitors is it
  does do support supports size sizes weight heavy light install installation cost bundle typescript ts types typed
  esm cjs commonjs es module modules format node nodejs engine engines compatible compatibility best top good
  recommended recommend library libraries lib libs js javascript what which how show me my between difference
  differences better than use using should i in on deprecated release releases history changelog option options
  popular tell find whats there any framework frameworks tool tools that can need want way help please some
  simple easy fast lightweight small my your our from by vs.
`.trim().split(/\s+/));

// ─── searchData ─────────────────────────────────────────────────────────────

/**
 * searchData may be an object, an array of objects, or a bare entity list.
 * Returns { query, entities }.
 */
export function normalizeSearchData(searchData, fallbackQuery = '') {
  let item = searchData;
  if (Array.isArray(searchData)) {
    const looksLikeEntities = searchData.length > 0 && searchData[0] && 'sourceID' in searchData[0] && !('entities' in searchData[0]);
    if (looksLikeEntities) return { query: fallbackQuery || '', entities: searchData };
    item = searchData.find((x) => x && (x.query || x.entities)) || searchData[0];
  }
  item = item && typeof item === 'object' ? item : {};
  const query = typeof item.query === 'string' && item.query ? item.query : typeof item.searchQuery === 'string' ? item.searchQuery : fallbackQuery;
  return { query: query || '', entities: Array.isArray(item.entities) ? item.entities : [] };
}

function isPackageEntity(e) {
  if (!e || typeof e.sourceID !== 'string' || !e.sourceID) return false;
  if (e.collectionName || e.collectionType) return e.collectionName === 'NPM_PACKAGES' || e.collectionType === 'HD_PACKAGES';
  return true;
}

// ─── Tokens ─────────────────────────────────────────────────────────────────

const NAME_SHAPE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const SPEC_SHAPE = /^v?(\d+)(\.\d+){0,2}(\.x)?$/;

/** Splits the query into { name, spec } tokens; "react@18" yields both parts. */
function tokenize(q) {
  const raw = q.match(/@?[a-z0-9][\w.~/-]*(?:@[\w.^~]+)?/g) || [];
  return raw.map((t) => {
    t = t.replace(/[.\-/]+$/, '');
    const at = t.lastIndexOf('@');
    if (at > 0) return { text: t, name: t.slice(0, at), spec: cleanSpec(t.slice(at + 1)) };
    return { text: t, name: t, spec: null };
  });
}

function cleanSpec(s) {
  const m = SPEC_SHAPE.exec(String(s).replace(/^[\^~=]+/, ''));
  return m ? s.replace(/^[\^~=v]+/, '').replace(/\.x$/, '') : null;
}

/** Version specs such as "4", "v5", "4.17", or "@18". */
export function findVersionSpecs(q) {
  const specs = [];
  for (const t of tokenize(q)) {
    if (t.spec) specs.push(t.spec);
    else if (SPEC_SHAPE.test(t.text)) specs.push(cleanSpec(t.text));
  }
  return [...new Set(specs.filter(Boolean))];
}

// ─── Use-case terms ─────────────────────────────────────────────────────────

const ADD_E = /(at|iz|ys|rs|ag|ar|ur|ul|od|ov|ac|uc|id|ach|out|[bdgpt]l)$/;

/** Light stemming: "parsing" → "parse", "formatting" → "format", "dates" → "date". */
export function stem(word) {
  let w = word;
  if (w.length > 5 && w.endsWith('ing')) {
    w = w.slice(0, -3);
    if (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(ss|ll|ff|zz)$/.test(w)) w = w.slice(0, -1);
    else if (ADD_E.test(w)) w += 'e';
    return w;
  }
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function useCaseTerms(q) {
  const words = q.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) || [];
  const terms = words
    .map((w) => w.replace(/[.-]+$/, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !SPEC_SHAPE.test(w))
    .map(stem);
  return [...new Set(terms)].slice(0, 4);
}

// ─── Main entry ─────────────────────────────────────────────────────────────

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @returns {{ intent: string|null, names: string[], specs: string[], terms: string[], query: string }}
 */
export function parseIntent(searchData, fallbackQuery) {
  const { query, entities } = normalizeSearchData(searchData, fallbackQuery);
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const tokens = tokenize(q);

  // 1. Packages the platform recognised, in the order they appear in the query.
  const seen = new Set();
  let found = entities
    .filter(isPackageEntity)
    .map((e) => {
      const name = e.sourceID.toLowerCase();
      const word = String(e.word || e.sourceID).toLowerCase();
      const at = q.indexOf(word);
      return { name, word, at: at < 0 ? q.indexOf(name) : at };
    })
    .sort((a, b) => (a.at < 0 ? Infinity : a.at) - (b.at < 0 ? Infinity : b.at))
    .filter((e) => (seen.has(e.name) ? false : seen.add(e.name)));

  // 2. Name-shaped tokens fill the gap when the platform missed a package
  //    (e.g. one outside its top 10,000), but only where the query clearly names packages.
  const candidates = tokens
    .filter((t) => !seen.has(t.name) && NAME_SHAPE.test(t.name) && !STOPWORDS.has(t.name) && !SPEC_SHAPE.test(t.name) && t.name.length > 1)
    .filter((t) => !found.some((f) => f.word.split(/\s+/).includes(t.name)));
  const namesPackages = ALTERNATIVES_CUE.test(q) || COMPARE_CUE.test(q) || /,/.test(q) || /^(npm|package info)\s+\S+$/.test(q) || LATEST_CUE.test(q);
  const asksForTask = USE_CASE_CUE.test(q) && !ALTERNATIVES_CUE.test(q) && !COMPARE_CUE.test(q);

  if (namesPackages && !asksForTask) {
    for (const t of candidates) {
      if (found.length >= 3) break;
      if (seen.has(t.name)) continue;
      seen.add(t.name);
      found.push({ name: t.name, word: t.text, at: q.indexOf(t.text) });
    }
    found.sort((a, b) => a.at - b.at);
  }

  // A use-case query can contain words that happen to be package names
  // ("library for parsing csv" → csv); there they are task terms, not the subject.
  if (asksForTask && !findVersionSpecs(q).length) found = [];

  const names = found.slice(0, 3).map((f) => f.name);

  // 3. Version specs ("4", "v5", "@18").
  const specs = names.length === 1 ? findVersionSpecs(q).slice(0, 2) : [];

  // 4. Match the rules, testing cue words against the query minus the package names.
  let rest = q;
  for (const f of found) rest = rest.replace(new RegExp(escapeRe(f.word) + '(@[\\w.^~]+)?', 'g'), ' ');
  const terms = names.length ? [] : useCaseTerms(q);
  const ctx = { q, rest, names, specs, terms };
  const rule = INTENT_RULES.find((r) => r.test(ctx));

  return { intent: rule ? rule.intent : null, names, specs, terms, query };
}
