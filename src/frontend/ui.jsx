// Small shared pieces: async/width hooks, loading and error states, suggestions,
// the package picker (autocomplete), copy button, deprecated stamp and barcode.

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { search } from './lib/npm.js';
import { compact } from './lib/format.js';

// ─── Hooks ──────────────────────────────────────────────────────────────────

/** Runs an async loader whenever deps change; ignores results from stale runs. */
export function useAsync(load, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading', data: null, error: null });
    load().then(
      (data) => live && setState({ status: 'done', data, error: null }),
      (error) => live && setState({ status: 'error', data: null, error }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

/** Tells the platform the first view is ready once loading has finished. */
export function useReady(status, ready) {
  useEffect(() => {
    if (status !== 'loading') ready();
  }, [status, ready]);
}

/** Width of an element, tracked with ResizeObserver. */
export function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

// ─── States ─────────────────────────────────────────────────────────────────

export function Loading({ label }) {
  return (
    <div className="nl-loading" role="status" aria-live="polite">
      <div className="nl-loading__label" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{label}</p>
    </div>
  );
}

const ERROR_TEXT = {
  'rate-limited': 'npm is rate-limiting requests right now. Wait a few seconds and try again.',
  network: 'Could not reach npm. Check the connection and try again.',
  server: 'npm returned an error. It is usually temporary.',
  'bad-data': 'npm returned data in an unexpected shape.',
};

export function ErrorNote({ error, name, onRetry, go }) {
  if (error && error.type === 'not-found' && name) {
    return (
      <div className="nl-error" role="alert">
        <p className="nl-error__title">
          No package called <code>{name}</code> on npm.
        </p>
        <Suggestions name={name} go={go} />
      </div>
    );
  }
  return (
    <div className="nl-error" role="alert">
      <p className="nl-error__title">{(error && ERROR_TEXT[error.type]) || 'Something went wrong while loading from npm.'}</p>
      {error && error.message && !ERROR_TEXT[error.type] ? <p className="nl-muted">{error.message}</p> : null}
      {onRetry ? (
        <button type="button" className="nl-btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Close matches for a name that does not exist: npm search results within a small edit distance. */
export function Suggestions({ name, go }) {
  // npm search is not fuzzy, so also try the first name segment minus its last letter ("fastifyy" → "fastify").
  const { status, data } = useAsync(async () => {
    const bare = name.replace(/^@[^/]+\//, '');
    const head = bare.split(/[-_.]/)[0];
    const texts = [...new Set([bare.replace(/[-_.]/g, ' '), head.length > 4 ? head.slice(0, -1) : head])];
    const results = await Promise.allSettled(texts.map((t) => search(t, 20)));
    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  }, [name]);
  if (status === 'loading') return <p className="nl-muted">Looking for close matches…</p>;
  const limit = Math.max(2, Math.floor(name.length / 3));
  // Also compare against the start of the typed name, so "fastifyy-qq" still suggests "fastify".
  const distance = (n) => Math.min(editDistance(name, n), n.length >= 4 ? editDistance(name.slice(0, n.length), n) + 1 : Infinity);
  const names = (data || [])
    .map((o) => ({ n: o.package.name, d: distance(o.package.name) }))
    .filter((x, i, all) => x.n !== name && x.d <= limit && all.findIndex((y) => y.n === x.n) === i)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5)
    .map((x) => x.n);
  if (!names.length) return <p className="nl-muted">npm search found no close matches.</p>;
  return (
    <div className="nl-suggest">
      <span className="nl-muted">Did you mean</span>
      <ul>
        {names.map((n) => (
          <li key={n}>
            <button type="button" className="nl-link nl-mono" onClick={() => go({ type: 'details', name: n })}>
              {n}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Picker ─────────────────────────────────────────────────────────────────

/** Text field with npm-search autocomplete. Enter picks the highlighted or typed name. */
export function PackagePicker({ label, onPick, onCancel, exclude = [] }) {
  const id = useId();
  const inputRef = useRef(null);
  const [text, setText] = useState('');
  const [options, setOptions] = useState([]);
  const [active, setActive] = useState(-1);

  useEffect(() => inputRef.current && inputRef.current.focus(), []);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setOptions([]);
      return undefined;
    }
    let live = true;
    const t = setTimeout(() => {
      search(q, 20).then(
        (objs) => {
          if (!live) return;
          const lower = q.toLowerCase();
          const opts = objs
            .map((o) => ({ name: o.package.name, weekly: (o.downloads && o.downloads.weekly) || 0 }))
            .filter((o) => !exclude.includes(o.name))
            // Names starting with what was typed first, then the most downloaded.
            .sort((a, b) => Number(b.name.startsWith(lower)) - Number(a.name.startsWith(lower)) || b.weekly - a.weekly);
          setOptions(opts.slice(0, 6));
        },
        () => live && setOptions([]),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const pick = (name) => {
    const n = name.trim().toLowerCase();
    if (n && !exclude.includes(n)) onPick(n);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(active >= 0 && options[active] ? options[active].name : text);
    } else if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  };

  return (
    <div className="nl-picker">
      <label htmlFor={id} className="nl-caption">
        {label}
      </label>
      <div className="nl-picker__row">
        <input
          ref={inputRef}
          id={id}
          className="nl-input nl-mono"
          value={text}
          placeholder="package name"
          autoComplete="off"
          spellCheck="false"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={id + '-list'}
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="nl-btn" onClick={() => pick(active >= 0 && options[active] ? options[active].name : text)}>
          Go
        </button>
        {onCancel ? (
          <button type="button" className="nl-btn nl-btn--quiet" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      {options.length > 0 ? (
        <ul className="nl-picker__list" role="listbox" id={id + '-list'}>
          {options.map((o, i) => (
            <li
              key={o.name}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.name);
              }}
            >
              <span className="nl-mono">{o.name}</span>
              <span className="nl-muted">{compact(o.weekly)}/wk</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ─── Bits ───────────────────────────────────────────────────────────────────

export function CopyButton({ text }) {
  const [state, setState] = useState('idle');
  const copy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (!ok) throw new Error('copy failed');
      }
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1600);
  };
  return (
    <button type="button" className="nl-copy" onClick={copy} aria-label={`Copy "${text}"`}>
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}</span>
    </button>
  );
}

export function Stamp({ children = 'Deprecated' }) {
  return (
    <span className="nl-stamp" role="img" aria-label="Deprecated">
      {children}
    </span>
  );
}

/** Decorative barcode derived from the package name. */
export function Barcode({ seed }) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const bars = [];
  let x = 0;
  for (let i = 0; i < 28; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const w = 1 + ((h >>> 3) & 1) + ((h >>> 7) & 1 && i % 3 === 0 ? 1 : 0);
    if (i % 2 === 0) bars.push(<rect key={i} x={x} y="0" width={w} height="24" />);
    x += w + 1;
  }
  return (
    <svg className="nl-barcode" viewBox={`0 0 ${x} 24`} width={x} height="24" aria-hidden="true" focusable="false">
      {bars}
    </svg>
  );
}

export function Takeaways({ lines, title = 'Takeaways' }) {
  if (!lines.length) return null;
  return (
    <section className="nl-takeaways" aria-label={title}>
      <h3 className="nl-caption">{title}</h3>
      <ul>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
