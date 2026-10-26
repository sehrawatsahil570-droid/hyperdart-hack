// Ranked lists: alternatives to a package, and packages for a use case.
// Each list prints the rule that produced it.

import React from 'react';
import { loadPackage } from './lib/packages.js';
import { findAlternatives, findForUseCase, MIN_WEEKLY } from './lib/discover.js';
import { compact, full, ago, list, plural } from './lib/format.js';
import { useAsync, useReady, Loading, ErrorNote } from './ui.jsx';

export function AlternativesView({ view, go, ready, headingRef }) {
  const { name } = view;
  const { status, data, error, retry } = useAsync(async () => {
    const subject = await loadPackage(name);
    return { subject, result: await findAlternatives(subject) };
  }, [name]);
  useReady(status, ready);

  if (status === 'loading') return <Loading label={`Finding packages similar to ${name}…`} />;
  if (status === 'error') return <ErrorNote error={error} name={name} onRetry={retry} go={go} />;

  const { subject, result } = data;
  return (
    <section className="nl-panel" aria-labelledby="nl-title">
      <h2 id="nl-title" className="nl-title" tabIndex={-1} ref={headingRef}>
        Alternatives to <span className="nl-mono">{name}</span>
      </h2>
      {subject.deprecated ? <p className="nl-note">{name} is deprecated: {subject.deprecated}</p> : null}

      {result.reason === 'no-keywords' ? (
        <p className="nl-note">{name} lists no descriptive npm keywords, so there is nothing to match alternatives on.</p>
      ) : result.items.length ? (
        <RankedList items={result.items} go={go} subject={name} />
      ) : (
        <p className="nl-note">No package shares enough keywords with {name} and has enough downloads to list.</p>
      )}

      {result.reason !== 'no-keywords' ? (
        <p className="nl-rule">
          <strong>How this list is ranked.</strong> Searched npm for packages tagged {list(result.keywords.map((k) => `“${k}”`))} or “{name}”. Kept those sharing at least{' '}
          {plural(result.required, 'keyword')} with {name}
          {result.primary ? `, including “${result.primary}” (the first keyword its description uses)` : ''}; listing “{name}” as a keyword counts as one. Sorted by weekly downloads from npm search.{' '}
          Hidden: {result.hidden} under {full(Math.round(result.floor))} weekly downloads
          {result.sameScope ? `, ${result.sameScope} more from a scope already listed` : ''}, and plugins or companions of {name}.
          {result.failedQueries ? ` ${plural(result.failedQueries, 'search')} failed, so the list may be incomplete.` : ''}
        </p>
      ) : null}

      <div className="nl-actions">
        {result.items.length ? (
          <button type="button" className="nl-btn" onClick={() => go({ type: 'compare', names: [name, ...result.items.filter((i) => !i.deprecated).slice(0, 2).map((i) => i.name)] })}>
            Compare {name} with the top {Math.min(2, result.items.filter((i) => !i.deprecated).length)}
          </button>
        ) : null}
        <button type="button" className="nl-btn nl-btn--quiet" onClick={() => go({ type: 'details', name })}>
          {name} details
        </button>
      </div>
    </section>
  );
}

export function UseCaseView({ view, go, ready, headingRef }) {
  const { terms } = view;
  const { status, data, error, retry } = useAsync(() => findForUseCase(terms), [terms.join(' ')]);
  useReady(status, ready);

  if (status === 'loading') return <Loading label={`Searching npm for ${terms.join(' + ')}…`} />;
  if (status === 'error') return <ErrorNote error={error} onRetry={retry} go={go} />;

  const top = data.items.filter((i) => !i.deprecated).slice(0, 3).map((i) => i.name);
  return (
    <section className="nl-panel" aria-labelledby="nl-title">
      <h2 id="nl-title" className="nl-title" tabIndex={-1} ref={headingRef}>
        Packages for{' '}
        {terms.map((t, i) => (
          <React.Fragment key={t}>
            {i ? ' + ' : ''}
            <span className="nl-term">{t}</span>
          </React.Fragment>
        ))}
      </h2>

      {data.items.length ? <RankedList items={data.items} go={go} /> : <p className="nl-note">npm search found no packages with at least {full(MIN_WEEKLY)} weekly downloads for these terms.</p>}

      <p className="nl-rule">
        <strong>How this list is ranked.</strong>{' '}
        {data.relaxed
          ? `Fewer than three packages mention every term (${data.matchedAll} did), so this list follows npm's own relevance order.`
          : `Packages whose name, description or keywords contain every term (${data.matchedAll} matched), sorted by weekly downloads from npm search.`}{' '}
        Hidden: {data.hidden} under {full(MIN_WEEKLY)} weekly downloads.
        {data.failedQueries ? ' One search failed, so the list may be incomplete.' : ''} Popularity is not a quality verdict; check the details before choosing.
      </p>

      {top.length >= 2 ? (
        <div className="nl-actions">
          <button type="button" className="nl-btn" onClick={() => go({ type: 'compare', names: top })}>
            Compare the top {top.length}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RankedList({ items, go, subject }) {
  const max = Math.max(...items.map((i) => i.weekly || 0), 1);
  return (
    <ol className="nl-ranked">
      {items.map((item, i) => (
        <li key={item.name} className={item.deprecated ? 'is-deprecated' : ''}>
          <span className="nl-ranked__n" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="nl-ranked__body">
            <div className="nl-ranked__top">
              <button type="button" className="nl-link nl-mono nl-ranked__name" onClick={() => go({ type: 'details', name: item.name })}>
                {item.name}
              </button>
              {item.deprecated ? <span className="nl-chip nl-chip--warn">deprecated</span> : null}
              {item.publishedAt ? <span className="nl-muted nl-small">published {ago(item.publishedAt)}</span> : null}
            </div>
            {item.description ? <p className="nl-ranked__desc">{item.description}</p> : null}
            <div className="nl-ranked__meta">
              {item.shared.length ? (
                <ul className="nl-tags" aria-label="Shared keywords">
                  {item.shared.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              ) : null}
              {subject ? (
                <button type="button" className="nl-link nl-small" onClick={() => go({ type: 'compare', names: [subject, item.name] })}>
                  Compare with {subject}
                </button>
              ) : null}
            </div>
            <div className="nl-bar" title={`${full(item.weekly)} weekly downloads`}>
              <span className="nl-bar__fill" style={{ width: `${((item.weekly || 0) / max) * 100}%` }} />
              <span className="nl-bar__label">{compact(item.weekly)}/wk</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
