import { describe, it, expect } from 'vitest';
import { parseIntent, normalizeSearchData, findVersionSpecs, stem, useCaseTerms } from '../src/frontend/lib/intent.js';

const entities = (...names) => names.map((n) => ({ word: n, sourceID: n, collectionName: 'NPM_PACKAGES', collectionType: 'HD_PACKAGES' }));
const parse = (query, names = []) => parseIntent({ query, entities: entities(...names) });

describe('parseIntent: example queries', () => {
  it.each([
    // query, platform entities, intent, names, specs, terms
    ['npm express', ['express'], 'details', ['express'], [], []],
    ['latest version of react', ['react'], 'latest', ['react'], [], []],
    ['compare packages express, fastify', ['express', 'fastify'], 'compare', ['express', 'fastify'], [], []],
    ['compare express, fastify, koa', ['express', 'fastify', 'koa'], 'compare', ['express', 'fastify', 'koa'], [], []],
    ['npm alternatives to moment', ['moment'], 'alternatives', ['moment'], [], []],
    ['packages like lodash', ['lodash'], 'alternatives', ['lodash'], [], []],
    ['npm request', ['request'], 'details', ['request'], [], []],
    ['best npm package for date formatting', ['date'], 'usecase', [], [], ['date', 'format']],
    ['library for parsing csv', ['csv'], 'usecase', [], [], ['parse', 'csv']],
    ['is axios esm', ['axios'], 'install', ['axios'], [], []],
    ['express typescript', ['express'], 'install', ['express'], [], []],
    ['express 4 vs 5', ['express'], 'versions', ['express'], ['4', '5'], []],
    ['react@18 vs react@19', ['react'], 'versions', ['react'], ['18', '19'], []],
    ['express 4', ['express'], 'versions', ['express'], ['4'], []],
    ['npm @types/node', ['@types/node'], 'details', ['@types/node'], [], []],
  ])('%s', (query, names, intent, expectedNames, specs, terms) => {
    const r = parse(query, names);
    expect(r).toMatchObject({ intent, names: expectedNames, specs, terms, query });
  });
});

describe('parseIntent: wider phrasings (match the extra regexes in hyperdart.config.js)', () => {
  it.each([
    ['what is express', ['express'], 'details', ['express']],
    ['tell me about lodash', ['lodash'], 'details', ['lodash']],
    ['express npm', ['express'], 'details', ['express']],
    ['is request deprecated', ['request'], 'details', ['request']],
    ['react latest version', ['react'], 'latest', ['react']],
    ['newest version of vue', ['vue'], 'latest', ['vue']],
    ['react latest', ['react'], 'latest', ['react']],
    ['express vs fastify', ['express', 'fastify'], 'compare', ['express', 'fastify']],
    ['react or vue', ['react', 'vue'], 'compare', ['react', 'vue']],
    ['difference between react and vue', ['react', 'vue'], 'compare', ['react', 'vue']],
    ['moment alternatives', ['moment'], 'alternatives', ['moment']],
    ['replace moment', ['moment'], 'alternatives', ['moment']],
    ['instead of request', ['request'], 'alternatives', ['request']],
    ['replacement for request', ['request'], 'alternatives', ['request']],
    ['moment competitors', ['moment'], 'alternatives', ['moment']],
    ['does express support typescript', ['express'], 'install', ['express']],
    ['lodash bundle size', ['lodash'], 'install', ['lodash']],
    ['express node version', ['express'], 'install', ['express']],
    ['express changelog', ['express'], 'history', ['express']],
    ['react releases', ['react'], 'history', ['react']],
    ['express versions', ['express'], 'history', ['express']],
  ])('%s', (query, names, intent, expectedNames) => {
    expect(parse(query, names)).toMatchObject({ intent, names: expectedNames });
  });

  it.each([
    ['top libraries for charts', [], ['chart']],
    ['js library to resize images', [], ['resize', 'image']],
    ['npm package for csv', ['csv'], ['csv']],
  ])('use case: %s', (query, names, terms) => {
    expect(parse(query, names)).toMatchObject({ intent: 'usecase', names: [], terms });
  });
});

describe('parseIntent: package names', () => {
  it('orders packages as they appear in the query, not as the platform lists them', () => {
    expect(parse('compare vue and react', ['react', 'vue']).names).toEqual(['vue', 'react']);
  });

  it('fills in a package the platform did not recognise in a compare query', () => {
    expect(parse('compare express, fastify, koa', ['express', 'fastify']).names).toEqual(['express', 'fastify', 'koa']);
    expect(parse('compare express vs hono', ['express']).names).toEqual(['express', 'hono']);
  });

  it('reads "npm <name>" for a package outside the platform list', () => {
    expect(parse('npm some-obscure-thing')).toMatchObject({ intent: 'details', names: ['some-obscure-thing'] });
  });

  it('does not read cue words inside a package name ("node-fetch" is not "node")', () => {
    expect(parse('npm node-fetch', ['node-fetch']).intent).toBe('details');
  });

  it('caps a comparison at three packages', () => {
    expect(parse('compare a1, b2, c3, d4', ['a1', 'b2', 'c3', 'd4']).names).toHaveLength(3);
  });

  it('ignores entities from other collections and duplicate entities', () => {
    const r = parseIntent({
      query: 'npm express',
      entities: [...entities('express', 'express'), { word: '20+30', sourceID: 'word', collectionName: 'EXPRESSION' }],
    });
    expect(r.names).toEqual(['express']);
  });

  it('returns no intent when the query names nothing', () => {
    expect(parse('').intent).toBeNull();
  });
});

describe('normalizeSearchData', () => {
  const item = { query: 'npm express', entities: entities('express') };

  it('accepts a single object', () => {
    expect(normalizeSearchData(item)).toEqual({ query: 'npm express', entities: item.entities });
  });

  it('accepts an array of objects', () => {
    expect(normalizeSearchData([item])).toEqual({ query: 'npm express', entities: item.entities });
  });

  it('accepts a bare entity list, taking the query from the fallback', () => {
    expect(normalizeSearchData(entities('koa'), 'npm koa')).toEqual({ query: 'npm koa', entities: entities('koa') });
  });

  it('survives missing or malformed input', () => {
    expect(normalizeSearchData(undefined)).toEqual({ query: '', entities: [] });
    expect(normalizeSearchData([])).toEqual({ query: '', entities: [] });
    expect(normalizeSearchData({ query: 'x', entities: 'nope' })).toEqual({ query: 'x', entities: [] });
  });
});

describe('version specs and use-case terms', () => {
  it('finds bare, v-prefixed, @-attached and .x specs', () => {
    expect(findVersionSpecs('express 4 vs v5')).toEqual(['4', '5']);
    expect(findVersionSpecs('react@18 vs react@19.1')).toEqual(['18', '19.1']);
    expect(findVersionSpecs('lodash 4.x')).toEqual(['4']);
    expect(findVersionSpecs('npm express')).toEqual([]);
  });

  it.each([
    ['parsing', 'parse'],
    ['formatting', 'format'],
    ['validating', 'validate'],
    ['caching', 'cache'],
    ['testing', 'test'],
    ['logging', 'log'],
    ['compressing', 'compress'],
    ['dates', 'date'],
    ['libraries', 'library'],
    ['csv', 'csv'],
    ['class', 'class'],
  ])('stems %s → %s', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });

  it('drops filler words and keeps at most four terms', () => {
    expect(useCaseTerms('what is the best npm library for parsing csv files')).toEqual(['parse', 'csv', 'file']);
    expect(useCaseTerms('a b c d e f g h i j').length).toBeLessThanOrEqual(4);
  });
});
