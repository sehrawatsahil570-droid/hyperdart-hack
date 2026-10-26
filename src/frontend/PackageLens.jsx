// Root component: reads the intent from searchData, keeps a stack of views for
// follow-up actions (with a back link), and applies theme and width classes.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@mui/material';
import { parseIntent } from './lib/intent.js';
import { useWidth } from './ui.jsx';
import DetailsView, { HistoryView } from './DetailsView.jsx';
import CompareView from './CompareView.jsx';
import VersionsView from './VersionsView.jsx';
import { AlternativesView, UseCaseView } from './DiscoverViews.jsx';
import './styles.css';

const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap';
const NARROW = 560;

const VIEWS = {
  details: DetailsView,
  history: HistoryView,
  compare: CompareView,
  versions: VersionsView,
  alternatives: AlternativesView,
  usecase: UseCaseView,
  empty: EmptyView,
};

/** The first view for a parsed query. */
export function viewForIntent({ intent, names, specs, terms }) {
  switch (intent) {
    case 'details':
    case 'latest':
    case 'install':
      return { type: 'details', name: names[0], focus: intent };
    case 'compare':
      return { type: 'compare', names };
    case 'versions':
      return { type: 'versions', name: names[0], specs };
    case 'alternatives':
      return { type: 'alternatives', name: names[0] };
    case 'usecase':
      return { type: 'usecase', terms };
    default:
      return { type: 'empty' };
  }
}

function describe(view) {
  switch (view.type) {
    case 'details':
      return view.name;
    case 'history':
      return `${view.name} releases`;
    case 'compare':
      return view.names.join(' vs ');
    case 'versions':
      return `${view.name} versions`;
    case 'alternatives':
      return `alternatives to ${view.name}`;
    case 'usecase':
      return view.terms.join(' + ');
    default:
      return 'start';
  }
}

function useFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-npm-lens-fonts]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS_HREF;
    link.dataset.npmLensFonts = '';
    document.head.appendChild(link);
  }, []);
}

export default function PackageLens(props) {
  const { searchData, searchQuery, messageHandlers, format } = props;
  const theme = useTheme();
  const dark = theme && theme.palette && theme.palette.mode === 'dark';
  useFonts();

  const parsed = useMemo(() => parseIntent(searchData, searchQuery), [searchData, searchQuery]);
  const queryKey = JSON.stringify([parsed.intent, parsed.names, parsed.specs, parsed.terms]);
  const [stack, setStack] = useState(() => [viewForIntent(parsed)]);

  // A new search replaces the whole navigation stack.
  useEffect(() => {
    setStack([viewForIntent(parsed)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // Notify the platform once, when the first view has data or an error.
  const loadedSent = useRef(false);
  const ready = useCallback(() => {
    if (loadedSent.current) return;
    loadedSent.current = true;
    if (messageHandlers && typeof messageHandlers.componentLoaded === 'function') messageHandlers.componentLoaded();
  }, [messageHandlers]);

  // After a follow-up action, move focus to the new view's heading once it renders.
  const pendingFocus = useRef(false);
  const headingRef = useCallback((el) => {
    if (el && pendingFocus.current) {
      pendingFocus.current = false;
      el.focus();
    }
  }, []);

  const go = useCallback((view) => {
    pendingFocus.current = true;
    setStack((s) => [...s, view]);
  }, []);
  const back = useCallback(() => {
    pendingFocus.current = true;
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const rootRef = useRef(null);
  const width = useWidth(rootRef);
  const narrow = width ? width < NARROW : format === 'sidebar';

  const view = stack[stack.length - 1];
  const View = VIEWS[view.type] || EmptyView;
  const previous = stack.length > 1 ? stack[stack.length - 2] : null;

  return (
    <div ref={rootRef} className={`nl ${dark ? 'nl--dark' : 'nl--light'} ${narrow ? 'nl--narrow' : 'nl--wide'}`}>
      {previous ? (
        <button type="button" className="nl-back" onClick={back}>
          <span aria-hidden="true">←</span> Back to {describe(previous)}
        </button>
      ) : null}
      <View key={stack.length + JSON.stringify(view)} view={view} go={go} ready={ready} headingRef={headingRef} narrow={narrow} />
    </div>
  );
}

function EmptyView({ go, ready, headingRef }) {
  useEffect(() => ready(), [ready]);
  const examples = [
    ['npm express', { type: 'details', name: 'express' }],
    ['compare express, fastify, koa', { type: 'compare', names: ['express', 'fastify', 'koa'] }],
    ['alternatives to moment', { type: 'alternatives', name: 'moment' }],
    ['express 4 vs 5', { type: 'versions', name: 'express', specs: ['4', '5'] }],
    ['library for parsing csv', { type: 'usecase', terms: ['parse', 'csv'] }],
  ];
  return (
    <section className="nl-panel" aria-labelledby="nl-title">
      <h2 id="nl-title" className="nl-title" tabIndex={-1} ref={headingRef}>
        Ask about an npm package
      </h2>
      <p className="nl-muted">The query did not name a package or a task. Try one of these:</p>
      <ul className="nl-examples">
        {examples.map(([label, view]) => (
          <li key={label}>
            <button type="button" className="nl-link nl-mono" onClick={() => go(view)}>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
