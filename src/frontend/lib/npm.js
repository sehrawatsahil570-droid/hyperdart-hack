// Every network call goes through fetchJSON: timeout, one retry, typed errors and
// a promise cache. Endpoints below are the public npm registry and downloads API.

const REGISTRY = 'https://registry.npmjs.org';
const DOWNLOADS = 'https://api.npmjs.org';

const DEFAULT_TIMEOUT = 9000;
const PACKUMENT_TIMEOUT = 20000;
const MAX_RETRY_WAIT = 5000;

export class NpmError extends Error {
  /**
   * @param {'not-found'|'rate-limited'|'network'|'server'|'bad-data'} type
   */
  constructor(type, message, status) {
    super(message);
    this.name = 'NpmError';
    this.type = type;
    this.status = status;
  }
}

const cache = new Map();

/**
 * GET a JSON resource. Concurrent and repeated calls for the same URL share one
 * promise; failed requests are removed from the cache so they can be retried.
 */
export function fetchJSON(url, { timeout = DEFAULT_TIMEOUT } = {}) {
  if (cache.has(url)) return cache.get(url);
  const promise = request(url, timeout, 1).catch((err) => {
    cache.delete(url);
    throw err;
  });
  cache.set(url, promise);
  return promise;
}

async function request(url, timeout, retriesLeft) {
  let res;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    clearTimeout(timer);
    if (retriesLeft > 0) return request(url, timeout, retriesLeft - 1);
    const timedOut = e && e.name === 'AbortError';
    throw new NpmError('network', timedOut ? 'The request timed out.' : 'The network request failed.');
  }
  clearTimeout(timer);

  if (res.status === 404) {
    const body = await res.json().catch(() => null);
    throw new NpmError('not-found', typeof body === 'string' ? body : 'Not found', 404);
  }
  if (res.status === 429 || res.status >= 500) {
    if (retriesLeft > 0) {
      await wait(retryDelay(res));
      return request(url, timeout, retriesLeft - 1);
    }
    throw res.status === 429
      ? new NpmError('rate-limited', 'npm is rate-limiting requests right now.', 429)
      : new NpmError('server', `npm returned an error (${res.status}).`, res.status);
  }
  if (!res.ok) throw new NpmError('server', `npm returned an error (${res.status}).`, res.status);

  let body;
  try {
    body = await res.json();
  } catch {
    throw new NpmError('bad-data', 'npm returned a response that is not JSON.');
  }
  // The registry answers some misses (e.g. unknown versions) with a bare JSON string.
  if (typeof body === 'string') throw new NpmError('not-found', body, res.status);
  if (!body || typeof body !== 'object') throw new NpmError('bad-data', 'npm returned an empty response.');
  return body;
}

function retryDelay(res) {
  const header = Number(res.headers.get('Retry-After'));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, MAX_RETRY_WAIT);
  return 800;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** The registry wants scoped names as "@scope%2fname". */
export function registryName(name) {
  return name.startsWith('@') ? '@' + encodeURIComponent(name.slice(1)) : encodeURIComponent(name);
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export function getManifest(name) {
  return fetchJSON(`${REGISTRY}/${registryName(name)}/latest`);
}

/** Full packument: every version and publish time. Can be several MB. */
export function getPackument(name) {
  return fetchJSON(`${REGISTRY}/${registryName(name)}`, { timeout: PACKUMENT_TIMEOUT });
}

export async function search(text, size = 25) {
  const body = await fetchJSON(`${REGISTRY}/-/v1/search?text=${encodeURIComponent(text)}&size=${size}`);
  if (!Array.isArray(body.objects)) throw new NpmError('bad-data', 'npm search returned an unexpected shape.');
  return body.objects;
}

/** The search hit for exactly this package, or null. */
export async function searchExact(name) {
  const objects = await search(name, 20);
  return objects.find((o) => o.package && o.package.name === name) || null;
}

export async function getWeeklyDownloads(name) {
  const body = await fetchJSON(`${DOWNLOADS}/downloads/point/last-week/${name}`);
  if (typeof body.downloads !== 'number') throw new NpmError('bad-data', 'No weekly download count.');
  return body.downloads;
}

export async function getDailyDownloads(name) {
  const body = await fetchJSON(`${DOWNLOADS}/downloads/range/last-month/${name}`);
  if (!Array.isArray(body.downloads)) throw new NpmError('bad-data', 'No daily download data.');
  return body.downloads.map((d) => ({ day: d.day, downloads: d.downloads }));
}

/** Last week's downloads keyed by exact version. */
export async function getVersionDownloads(name) {
  const body = await fetchJSON(`${DOWNLOADS}/versions/${registryName(name)}/last-week`);
  if (!body.downloads || typeof body.downloads !== 'object') {
    throw new NpmError('bad-data', 'No per-version download data.');
  }
  return body.downloads;
}

/** Resolves to the @types manifest, or null when DefinitelyTyped has none. */
export async function getTypesPackage(name) {
  const typesName = '@types/' + (name.startsWith('@') ? name.slice(1).replace('/', '__') : name);
  try {
    return await fetchJSON(`${REGISTRY}/${registryName(typesName)}/latest`);
  } catch (e) {
    if (e.type === 'not-found') return null;
    throw e;
  }
}
