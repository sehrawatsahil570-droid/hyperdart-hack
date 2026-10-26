// The package as a shipping label: install line as the address strip, downloads,
// size and dependencies as weight and contents, compatibility as handling marks.
// `focus` puts the direct answer first: 'latest' (version + date) or 'install' (cost/compat).

import React, { useState } from 'react';
import { loadPackage, getPackument, releaseHistory } from './lib/packages.js';
import { compact, full, bytes, date, ago, plural } from './lib/format.js';
import { useAsync, useReady, Loading, ErrorNote, CopyButton, Stamp, Barcode, PackagePicker } from './ui.jsx';
import Chart from './Chart.jsx';

export default function DetailsView({ view, go, ready, headingRef }) {
  const { name, focus = 'details' } = view;
  const { status, data: pkg, error, retry } = useAsync(() => loadPackage(name), [name]);
  useReady(status, ready);

  if (status === 'loading') return <Loading label={`Reading the npm registry for ${name}…`} />;
  if (status === 'error') return <ErrorNote error={error} name={name} onRetry={retry} go={go} />;

  return (
    <article className={'nl-label' + (pkg.deprecated ? ' is-deprecated' : '')} aria-labelledby="nl-title">
      <LabelHead pkg={pkg} headingRef={headingRef} />
      {pkg.deprecated ? <Deprecation pkg={pkg} /> : null}
      {focus === 'latest' ? <LatestAnswer pkg={pkg} /> : null}
      {focus === 'install' ? <InstallAnswer pkg={pkg} /> : null}
      {pkg.description ? <p className="nl-label__desc">{pkg.description}</p> : null}
      <AddressStrip name={pkg.name} />
      {focus === 'install' ? (
        <>
          <Handling pkg={pkg} />
          <Facts pkg={pkg} />
        </>
      ) : (
        <>
          <Facts pkg={pkg} />
          <Handling pkg={pkg} />
        </>
      )}
      {pkg.daily ? (
        <div className="nl-label__section">
          <Chart series={[{ name: pkg.name, color: 'var(--pkg-1)', days: pkg.daily }]} />
        </div>
      ) : null}
      <Gaps pkg={pkg} />
      <Links pkg={pkg} />
      <Actions pkg={pkg} go={go} />
    </article>
  );
}

export function LabelHead({ pkg, headingRef, caption = 'npm package' }) {
  return (
    <header className="nl-label__head">
      <div className="nl-label__id">
        <span className="nl-caption">{caption}</span>
        <h2 id="nl-title" className="nl-label__name nl-mono" tabIndex={-1} ref={headingRef}>
          {pkg.name}
        </h2>
        <span className="nl-chip nl-mono" title="Latest version">
          v{pkg.version}
        </span>
      </div>
      <Barcode seed={pkg.name + pkg.version} />
    </header>
  );
}

function Deprecation({ pkg }) {
  return (
    <div className="nl-label__deprecated">
      <Stamp />
      <div>
        <p className="nl-caption">npm deprecation message</p>
        <blockquote>{pkg.deprecated}</blockquote>
      </div>
    </div>
  );
}

function LatestAnswer({ pkg }) {
  return (
    <p className="nl-answer">
      The latest version of <code>{pkg.name}</code> is <strong className="nl-mono">{pkg.version}</strong>
      {pkg.publishedAt ? (
        <>
          , published {date(pkg.publishedAt)} ({ago(pkg.publishedAt)}).
        </>
      ) : (
        '. Its publish date is unavailable.'
      )}
    </p>
  );
}

function InstallAnswer({ pkg }) {
  const types = { bundled: 'ships its own TypeScript types', definitelytyped: `has types in ${pkg.types.label}`, none: 'has no TypeScript types', unknown: 'TypeScript types: unknown' }[pkg.types.kind];
  const format = { dual: 'dual ESM/CommonJS', esm: 'ESM-only', cjs: 'CommonJS', unknown: 'not declared as ESM or CommonJS' }[pkg.module.kind];
  return (
    <p className="nl-answer">
      <code>{pkg.name}</code> is {format}, {types},{' '}
      {pkg.node ? `declares Node ${pkg.node}` : 'declares no Node range'}, and unpacks to {bytes(pkg.unpackedSize)} (excl. deps) with {plural(pkg.deps, 'direct dependency', 'direct dependencies')}.
    </p>
  );
}

function AddressStrip({ name }) {
  const cmd = `npm i ${name}`;
  return (
    <div className="nl-label__ship">
      <span className="nl-caption">Install</span>
      <code className="nl-label__cmd">{cmd}</code>
      <CopyButton text={cmd} />
    </div>
  );
}

function Facts({ pkg }) {
  return (
    <dl className="nl-facts">
      <div>
        <dt>Weekly downloads</dt>
        <dd title={full(pkg.weekly)}>{compact(pkg.weekly)}</dd>
        <dd className="nl-small nl-muted">
          {pkg.weeklySource === 'search' ? 'from npm search' : pkg.weekly === null ? 'unavailable' : 'last 7 days'}
          {pkg.weeklyMissingDays ? `; npm has no data for ${pkg.weeklyMissingDays} of them, so this is likely low` : ''}
        </dd>
      </div>
      <div>
        <dt>Last publish</dt>
        <dd>{pkg.publishedAt ? ago(pkg.publishedAt) : '—'}</dd>
        <dd className="nl-small nl-muted">{pkg.publishedAt ? date(pkg.publishedAt) : 'unavailable'}</dd>
      </div>
      <div>
        <dt>Unpacked size</dt>
        <dd>{bytes(pkg.unpackedSize)}</dd>
        <dd className="nl-small nl-muted">excl. deps{pkg.fileCount ? ` · ${plural(pkg.fileCount, 'file')}` : ''}</dd>
      </div>
      <div>
        <dt>Dependencies</dt>
        <dd>{pkg.deps}</dd>
        <dd className="nl-small nl-muted">direct{pkg.peerDeps ? ` · ${pkg.peerDeps} peer` : ''}</dd>
      </div>
    </dl>
  );
}

function Handling({ pkg }) {
  const marks = [
    ['TypeScript', pkg.types.kind === 'bundled' ? 'Types bundled' : pkg.types.kind === 'definitelytyped' ? pkg.types.label : pkg.types.kind === 'none' ? 'No types' : 'Unknown'],
    ['Module', pkg.module.label],
    ['Node', pkg.node || 'Not declared'],
    ['License', pkg.license || 'None stated'],
  ];
  return (
    <ul className="nl-handling" aria-label="Compatibility">
      {marks.map(([k, v]) => (
        <li key={k}>
          <span className="nl-caption">{k}</span>
          <span className={k === 'TypeScript' || k === 'Node' ? 'nl-mono' : ''}>{v}</span>
        </li>
      ))}
    </ul>
  );
}

function Gaps({ pkg }) {
  const notes = [];
  if (pkg.gaps.includes('daily')) notes.push('Download history is unavailable right now.');
  if (pkg.weeklySource === 'search') notes.push('Weekly downloads come from npm search because the downloads API did not answer.');
  if (pkg.gaps.includes('weekly')) notes.push('Weekly downloads are unavailable right now.');
  if (pkg.gaps.includes('publish date')) notes.push('The publish date could not be loaded.');
  if (pkg.types.kind === 'unknown') notes.push('Could not check DefinitelyTyped for @types.');
  if (!notes.length) return null;
  return <p className="nl-note">{notes.join(' ')}</p>;
}

function Links({ pkg }) {
  const links = [
    ['npm', pkg.npmUrl],
    ['Repository', pkg.repoUrl],
    ['Homepage', pkg.homepage && pkg.homepage !== pkg.repoUrl && !pkg.homepage.startsWith((pkg.repoUrl || '\u0000') + '#') ? pkg.homepage : null],
  ].filter(([, u]) => u);
  return (
    <ul className="nl-links">
      {links.map(([label, url]) => (
        <li key={label}>
          <a href={url} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        </li>
      ))}
      {pkg.dependents ? <li className="nl-muted">{full(pkg.dependents)} dependents</li> : null}
    </ul>
  );
}

function Actions({ pkg, go }) {
  const [picking, setPicking] = useState(false);
  if (picking) {
    return (
      <div className="nl-actions">
        <PackagePicker label={`Compare ${pkg.name} with`} exclude={[pkg.name]} onPick={(other) => go({ type: 'compare', names: [pkg.name, other] })} onCancel={() => setPicking(false)} />
      </div>
    );
  }
  return (
    <div className="nl-actions">
      <button type="button" className="nl-btn" onClick={() => setPicking(true)}>
        Compare with…
      </button>
      <button type="button" className="nl-btn" onClick={() => go({ type: 'alternatives', name: pkg.name })}>
        See alternatives
      </button>
      <button type="button" className="nl-btn nl-btn--quiet" onClick={() => go({ type: 'history', name: pkg.name })}>
        Recent releases
      </button>
    </div>
  );
}

// ─── Release history ────────────────────────────────────────────────────────

export function HistoryView({ view, go, ready, headingRef }) {
  const { name } = view;
  const { status, data, error, retry } = useAsync(async () => {
    const packument = await getPackument(name);
    return { releases: releaseHistory(packument, 12), latest: (packument['dist-tags'] || {}).latest };
  }, [name]);
  useReady(status, ready);

  if (status === 'loading') return <Loading label={`Loading the release history of ${name}. Large packages can take a few seconds.`} />;
  if (status === 'error') return <ErrorNote error={error} name={name} onRetry={retry} go={go} />;

  return (
    <section className="nl-panel" aria-labelledby="nl-title">
      <h2 id="nl-title" className="nl-title" tabIndex={-1} ref={headingRef}>
        Recent releases of <span className="nl-mono">{name}</span>
      </h2>
      <ol className="nl-releases">
        {data.releases.map((r) => (
          <li key={r.version}>
            <span className="nl-mono nl-releases__v">{r.version}</span>
            <span className="nl-releases__tags">
              {r.tags.map((t) => (
                <span key={t} className="nl-chip nl-mono">
                  {t}
                </span>
              ))}
              {r.deprecated ? <span className="nl-chip nl-chip--warn">deprecated</span> : null}
            </span>
            <span className="nl-muted nl-releases__d">
              {date(r.publishedAt)} · {ago(r.publishedAt)}
            </span>
          </li>
        ))}
      </ol>
      <p className="nl-note">Newest 12 releases by publish time, including pre-releases and backports to older lines.</p>
      <div className="nl-actions">
        <button type="button" className="nl-btn" onClick={() => go({ type: 'details', name })}>
          Package details
        </button>
      </div>
    </section>
  );
}
