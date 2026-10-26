// Version-aware comparison ("express 4 vs 5", "react@18 vs react@19", "express 4").
// Each spec resolves to the newest stable release that matches it; a single spec is
// compared with the latest release.

import React from 'react';
import { getPackument, resolveSpec, describeVersion, downloadsByMajor } from './lib/packages.js';
import { versionTakeaways } from './lib/takeaways.js';
import { bytes, date, ago, compact, percent, list } from './lib/format.js';
import { useAsync, useReady, Loading, ErrorNote, Takeaways } from './ui.jsx';
import { PKG_COLORS } from './CompareView.jsx';

async function loadVersions(name, specs) {
  const [packument, shares] = await Promise.allSettled([getPackument(name), downloadsByMajor(name)]);
  if (packument.status === 'rejected') throw packument.reason;
  const doc = packument.value;
  const latest = (doc['dist-tags'] || {}).latest;

  const unresolved = [];
  const versions = [];
  for (const spec of specs) {
    const v = resolveSpec(doc, spec);
    if (v) versions.push({ spec, version: v });
    else unresolved.push(spec);
  }
  if (versions.length === 1 && latest && versions[0].version !== latest) versions.push({ spec: 'latest', version: latest });

  const seen = new Set();
  const described = versions
    .filter((v) => (seen.has(v.version) ? false : seen.add(v.version)))
    .map((v) => ({ ...describeVersion(doc, v.version), spec: v.spec }));

  return { described, unresolved, latest, shares: shares.status === 'fulfilled' ? shares.value : null };
}

const ROWS = [
  ['Released', (v) => (v.publishedAt ? `${date(v.publishedAt)} · ${ago(v.publishedAt)}` : 'unknown')],
  ['Node', (v) => v.node || 'Not declared', true],
  ['Dependencies', (v) => `${v.deps} direct${v.peerDeps ? ` · ${v.peerDeps} peer` : ''}`],
  ['Unpacked size', (v) => (v.unpackedSize === null ? 'unavailable' : bytes(v.unpackedSize))],
  ['Module format', (v) => v.module.label],
  ['TypeScript', (v) => v.types.label],
  ['Release line', (v) => (v.isLatest ? 'Current (latest tag)' : `Last ${v.major}.x: ${v.lastInLine}, ${ago(v.lastInLineAt)}`)],
  ['Releases in past year', (v) => `${v.releasesLastYear} in ${v.major}.x`],
  ['Status', (v) => (v.deprecated ? 'Deprecated' : 'Active')],
];

export default function VersionsView({ view, go, ready, headingRef }) {
  const { name, specs } = view;
  const { status, data, error, retry } = useAsync(() => loadVersions(name, specs), [name, specs.join(',')]);
  useReady(status, ready);

  if (status === 'loading') return <Loading label={`Loading every release of ${name}. This downloads the full release history, which can take a few seconds for large packages.`} />;
  if (status === 'error') return <ErrorNote error={error} name={name} onRetry={retry} go={go} />;

  const { described, unresolved, shares } = data;
  const lines = versionTakeaways(described);

  return (
    <section className="nl-panel" aria-labelledby="nl-title">
      <h2 id="nl-title" className="nl-title" tabIndex={-1} ref={headingRef}>
        <span className="nl-mono">{name}</span> {described.map((v) => v.version).join(' vs ')}
      </h2>
      <p className="nl-muted nl-small">
        {described.map((v) => (v.spec === 'latest' ? `latest = ${v.version}` : `“${v.spec}” → ${v.version}`)).join(' · ')}. Each spec resolves to its newest stable release.
      </p>

      {unresolved.length ? (
        <p className="nl-note" role="alert">
          {name} has no release matching {list(unresolved.map((s) => `“${s}”`))}.
        </p>
      ) : null}

      <Takeaways lines={lines} />

      {described.length ? (
        <div className="nl-ctable-wrap">
          <table className="nl-ctable" style={{ '--cols': described.length }}>
            <thead>
              <tr>
                <td />
                {described.map((v, i) => (
                  <th key={v.version} scope="col" className="nl-mono" style={{ '--c': PKG_COLORS[i] }}>
                    {v.version}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, get, mono]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {described.map((v, i) => (
                    <td key={v.version} className={(mono ? 'nl-mono ' : '') + (label === 'Status' && v.deprecated ? 'is-warn' : '')} style={{ '--c': PKG_COLORS[i] }}>
                      {get(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {shares ? <MajorShare shares={shares} highlight={described.map((v) => v.major)} /> : <p className="nl-note">Per-version download counts are unavailable right now.</p>}

      <div className="nl-actions">
        <button type="button" className="nl-btn" onClick={() => go({ type: 'details', name })}>
          Package details
        </button>
        <button type="button" className="nl-btn nl-btn--quiet" onClick={() => go({ type: 'history', name })}>
          Recent releases
        </button>
      </div>
    </section>
  );
}

/** One stacked bar: last week's downloads split by major version. */
function MajorShare({ shares, highlight }) {
  const top = shares.rows.slice(0, 4);
  const other = shares.rows.slice(4).reduce((s, r) => s + r.downloads, 0);
  // Majors being compared take their column colour; the rest stay neutral.
  const segments = top.map((r) => {
    const col = highlight.indexOf(r.major);
    return { label: `${r.major}.x`, downloads: r.downloads, share: r.share, on: col >= 0, color: col >= 0 ? PKG_COLORS[col] : undefined };
  });
  if (other > 0) segments.push({ label: 'other', downloads: other, share: shares.total ? other / shares.total : 0, on: false });

  return (
    <figure className="nl-share">
      <figcaption className="nl-caption">Last week's downloads by major version ({compact(shares.total)} total)</figcaption>
      <div className="nl-share__bar" role="img" aria-label={segments.map((s) => `${s.label} ${percent(s.share)}`).join(', ')}>
        {segments.map((s) => (
          <span key={s.label} className={'nl-share__seg' + (s.on ? ' is-on' : '')} style={{ flexGrow: s.share, '--seg-color': s.color }} title={`${s.label}: ${compact(s.downloads)}`} />
        ))}
      </div>
      <ul className="nl-share__legend">
        {segments.map((s) => (
          <li key={s.label} className={s.on ? 'is-on' : ''}>
            <span className="nl-share__key" style={{ '--seg-color': s.color }} aria-hidden="true" />
            <span className="nl-mono">{s.label}</span> {percent(s.share, s.share < 0.01 ? 1 : 0)}
          </li>
        ))}
      </ul>
    </figure>
  );
}
