import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJSON, NpmError, registryName, getTypesPackage, searchExact, getWeeklyDownloads } from '../src/frontend/lib/npm.js';

/** A minimal stand-in for a fetch Response. */
const res = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
});

// fetchJSON caches by URL for the whole module, so every test uses its own URL.
let n = 0;
const url = () => `https://registry.npmjs.org/test-${++n}`;

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchJSON', () => {
  it('returns JSON and caches the promise', async () => {
    fetchMock.mockResolvedValue(res(200, { ok: 1 }));
    const u = url();
    expect(await fetchJSON(u)).toEqual({ ok: 1 });
    expect(await fetchJSON(u)).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one request between concurrent callers', async () => {
    fetchMock.mockResolvedValue(res(200, { ok: 1 }));
    const u = url();
    await Promise.all([fetchJSON(u), fetchJSON(u), fetchJSON(u)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a 404 into a not-found error with npm\'s message, and does not cache it', async () => {
    fetchMock.mockResolvedValue(res(404, 'Not Found'));
    const u = url();
    await expect(fetchJSON(u)).rejects.toMatchObject({ name: 'NpmError', type: 'not-found', message: 'Not Found', status: 404 });
    await expect(fetchJSON(u)).rejects.toBeInstanceOf(NpmError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a bare JSON string body as not-found (unknown versions)', async () => {
    fetchMock.mockResolvedValue(res(200, 'version not found: 9.9.9'));
    await expect(fetchJSON(url())).rejects.toMatchObject({ type: 'not-found', message: 'version not found: 9.9.9' });
  });

  it('retries once after a 429, honouring Retry-After', async () => {
    fetchMock.mockResolvedValueOnce(res(429, 'slow down', { 'retry-after': '1' })).mockResolvedValueOnce(res(200, { ok: 2 }));
    const started = Date.now();
    expect(await fetchJSON(url())).toEqual({ ok: 2 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry with a typed error', async () => {
    fetchMock.mockResolvedValue(res(429, 'slow down', { 'retry-after': '0' }));
    await expect(fetchJSON(url())).rejects.toMatchObject({ type: 'rate-limited', status: 429 });
    fetchMock.mockClear().mockResolvedValue(res(503, 'down'));
    await expect(fetchJSON(url())).rejects.toMatchObject({ type: 'server', status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports network failures after one retry', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchJSON(url())).rejects.toMatchObject({ type: 'network', message: 'The network request failed.' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('times out a request that never answers', async () => {
    fetchMock.mockImplementation(
      (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    );
    await expect(fetchJSON(url(), { timeout: 20 })).rejects.toMatchObject({ type: 'network', message: 'The request timed out.' });
  });

  it('rejects a response that is not JSON', async () => {
    fetchMock.mockResolvedValue({ ...res(200, null), json: async () => { throw new SyntaxError('bad'); } });
    await expect(fetchJSON(url())).rejects.toMatchObject({ type: 'bad-data' });
  });
});

describe('endpoints', () => {
  it('encodes scoped names for the registry', () => {
    expect(registryName('express')).toBe('express');
    expect(registryName('@types/node')).toBe('@types%2Fnode');
  });

  it('returns null when DefinitelyTyped has no @types package', async () => {
    fetchMock.mockResolvedValue(res(404, 'Not Found'));
    expect(await getTypesPackage('no-types-here')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/@types%2Fno-types-here/latest', expect.anything());
  });

  it('maps a scoped package to its @types name', async () => {
    fetchMock.mockResolvedValue(res(200, { name: '@types/babel__core' }));
    expect(await getTypesPackage('@babel/core')).toEqual({ name: '@types/babel__core' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://registry.npmjs.org/@types%2Fbabel__core/latest');
  });

  it('picks the exact search hit, not the first one', async () => {
    fetchMock.mockResolvedValue(res(200, { objects: [{ package: { name: 'retry-request' } }, { package: { name: 'request-x' } }] }));
    expect(await searchExact('request-x')).toEqual({ package: { name: 'request-x' } });
    fetchMock.mockResolvedValue(res(200, { objects: [{ package: { name: 'retry-request' } }] }));
    expect(await searchExact('request-y')).toBeNull();
  });

  it('flags a downloads response without a count as bad data', async () => {
    fetchMock.mockResolvedValue(res(200, { error: 'package x not found' }));
    await expect(getWeeklyDownloads('weird-' + n++)).rejects.toMatchObject({ type: 'bad-data' });
  });
});
