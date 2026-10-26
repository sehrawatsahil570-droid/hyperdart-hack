// Two or three packages side by side: factual takeaways first, then the table,
// then one shared downloads chart. Each package keeps one colour throughout.

import React, { useState } from 'react';
import { loadPackage } from './lib/packages.js';
import { compareTakeaways } from './lib/takeaways.js';
import { compact, full, bytes, date, ago, list } from './lib/format.js';
import { useAsync, useReady, Loading, ErrorNote, PackagePicker, Takeaways } from './ui.jsx';
import Chart from './Chart.jsx';

export const PKG_COLORS = ['var(--pkg-1)', 'var(--pkg-2)', 'var(--pkg-3)'];

const ROWS = [
  ['Latest version', (p) => p.version, true],
  ['Weekly downloads', (p) => (p.weekly === null ? 'unavailable' : compact(p.weekly) + (p.weeklySource === 'search' ? ' (search)' : '')), false, (p) => full(p.weekly)],
  ['Last publish', (p) => (p.publishedAt ? `${date(p.publishedAt)} · ${ago(p.publishedAt)}` : 'unavailable')],
  ['TypeScript', (p) => ({ bundled: 'Bundled', definitelytyped: p.types.label, none: 'None', unknown: 'Unknown' })[p.types.kind], true],
  ['Module format', (p) => p.module.label],
  ['Node', (p) => p.node || 'Not declared', true],
  ['Unpacked size', (p) => (p.unpackedSize === null ? 'unavailable' : `${bytes(p.unpackedSize)}${p.fileCount ? ` · ${p.fileCount} files` : ''}`)],
  ['Dependencies', (p) => `${p.deps} direct${p.peerDeps ? ` · ${p.peerDeps} peer` : ''}`],
  ['Dependents', (p) => (p.dependents ? full(p.dependents) : '—')],
  ['License', (p) => p.license || 'None stated'],
  ['Status', (p) => (p.deprecated ? 'Deprecated' : 'Active')],
];

async function loadAll(names) {
  const results = await Promise.allSettled(names.map(loadPackage));
  const loaded = [];
  const failed = [];
  results.forEach((r, i) => (r.status === 'fulfilled' ? loaded.push({ ...r.value, color: PKG_COLORS[i] }) : failed.push({ name: names[i], error: r.reason })));
  if (!loaded.length) throw failed[0].error;
  return { loaded, failed };
}

export default function CompareView({ view, go, ready, headingRef }) {
  const names = view.names;
  const { status, data, error, retry } = useAsync(() => loadAll(names), [names.join(',')]);
  useReady(status, ready);
  const [adding, setAdding] = useState(names.length === 1);

  if (status === 'loading') return <Loading label={`Loading ${list(names)} from npm…`} />;
  if (status === 'error') return <ErrorNote error={error} name={names.length === 1 ? names[0] : null} onRetry={retry} go={go} />;

  const { loaded, failed } = data;
  const lines = loaded.length > 1 ? compareTakeaways(loaded) : [];
  const charted = loaded.filter((p) => p.daily);

  const remove = (name) => {
    const rest = names.filter((n) => n !== name);
    go(rest.length === 1 ? { type: 'details', name: rest[0] } : { type: 'compare', names: rest });
  };

  return (
    <section className="nl-panel" aria-labelledby="nl-title">
      <h2 id="nl-title" className="nl-title" tabIndex={-1} ref={headingRef}>
        {names.length === 1 ? (
          <>
            Compare <span className="nl-mono">{names[0]}</span> with…
          </>
        ) : (
          <>Comparing {names.length} packages</>
        )}
      </h2>

      <ul className="nl-chips" aria-label="Packages in this comparison">
        {loaded.map((p) => (
          <li key={p.name} className="nl-pkgchip" style={{ '--c': p.color }}>
            <button type="button" className="nl-link nl-mono" onClick={() => go({ type: 'details', name: p.name })} title={`Details for ${p.name}`}>
              {p.name}
            </button>
            {p.deprecated ? <span className="nl-chip nl-chip--warn">deprecated</span> : null}
            {names.length > 1 ? (
              <button type="button" className="nl-x" onClick={() => remove(p.name)} aria-label={`Remove ${p.name} from comparison`}>
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {failed.length ? (
        <p className="nl-note" role="alert">
          Could not load {list(failed.map((f) => (f.error && f.error.type === 'not-found' ? `"${f.name}" (not on npm)` : `"${f.name}"`)))}. Showing the rest.
        </p>
      ) : null}

      <Takeaways lines={lines} />

      {loaded.length > 1 ? <CompareTable pkgs={loaded} /> : null}

      {charted.length ? (
        <div className="nl-label__section">
          <Chart series={charted.map((p) => ({ name: p.name, color: p.color, days: p.daily }))} />
        </div>
      ) : loaded.length > 1 ? (
        <p className="nl-note">Download history is unavailable right now, so there is no chart.</p>
      ) : null}

      <div className="nl-actions">
        {adding && names.length < 3 ? (
          <PackagePicker
            label={names.length === 1 ? `Compare ${names[0]} with` : 'Add a package'}
            exclude={names}
            onPick={(n) => go({ type: 'compare', names: [...names, n] })}
            onCancel={names.length > 1 ? () => setAdding(false) : undefined}
          />
        ) : (
          <>
            {names.length < 3 ? (
              <button type="button" className="nl-btn" onClick={() => setAdding(true)}>
                Add a package
              </button>
            ) : (
              <button type="button" className="nl-btn" onClick={() => go({ type: 'compare', names: names.slice(0, 2) })}>
                Compare the first two
              </button>
            )}
            <button type="button" className="nl-btn nl-btn--quiet" onClick={() => go({ type: 'alternatives', name: names[0] })}>
              Alternatives to {names[0]}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function CompareTable({ pkgs }) {
  return (
    <div className="nl-ctable-wrap">
      <table className="nl-ctable" style={{ '--cols': pkgs.length }}>
        <thead>
          <tr>
            <td />
            {pkgs.map((p) => (
              <th key={p.name} scope="col" className="nl-mono" style={{ '--c': p.color }}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, get, mono, title]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {pkgs.map((p) => (
                <td key={p.name} className={(mono ? 'nl-mono ' : '') + (label === 'Status' && p.deprecated ? 'is-warn' : '')} title={title ? title(p) : undefined} data-pkg={p.name} style={{ '--c': p.color }}>
                  {get(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
