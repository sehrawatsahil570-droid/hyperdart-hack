// Hand-built SVG line chart for daily downloads. The y-axis always starts at zero.
// "Trend" mode indexes each line to its own first-week average (= 100) so shapes can
// be compared without implying equal volumes. Days npm reported no data for are shaded
// and the line breaks there instead of dropping to zero.

import React, { useMemo, useRef, useState } from 'react';
import { useWidth } from './ui.jsx';
import { compact, full, shortDay, date } from './lib/format.js';

const HEIGHT = 168;
const PAD = { top: 10, right: 12, bottom: 22, left: 46 };

/** A round tick step (1, 2 or 5 × 10^k) giving about four intervals up to `v`. */
function niceStep(v) {
  const raw = Math.max(v, 1) / 4;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}

/** Average of reported days in the first week, used as the index base (= 100). */
function indexBase(days) {
  const reported = days.slice(0, 7).filter((d) => !d.missing && d.downloads > 0);
  if (reported.length < 4) return null;
  return reported.reduce((s, d) => s + d.downloads, 0) / reported.length;
}

export default function Chart({ series, title = 'Daily downloads, last 30 days' }) {
  const boxRef = useRef(null);
  const width = Math.max(260, useWidth(boxRef) || 0);
  const [mode, setMode] = useState('absolute');
  const [cursor, setCursor] = useState(null);

  const usable = series.filter((s) => s.days && s.days.length);
  const canIndex = usable.length > 1 && usable.every((s) => indexBase(s.days));
  const trend = mode === 'trend' && canIndex;
  const days = usable.length ? usable[0].days.map((d) => d.day) : [];
  const missingDays = new Set(usable.flatMap((s) => s.days.filter((d) => d.missing).map((d) => d.day)));

  const lines = useMemo(
    () =>
      usable.map((s) => {
        const base = trend ? indexBase(s.days) : 1;
        return { ...s, values: s.days.map((d) => (d.missing ? null : trend ? (d.downloads / base) * 100 : d.downloads)) };
      }),
    [usable, trend],
  );

  if (!usable.length) return null;

  const peak = Math.max(1, ...lines.flatMap((l) => l.values.filter((v) => v !== null)));
  const step = niceStep(peak);
  const max = Math.ceil(peak / step) * step;
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const n = days.length;
  const x = (i) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => PAD.top + innerH - (v / max) * innerH;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const fmt = (v) => (trend ? Math.round(v).toString() : compact(v));

  const pathFor = (values) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const onKeyDown = (e) => {
    const keys = { ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in keys) {
      e.preventDefault();
      setCursor((c) => Math.min(n - 1, Math.max(0, (c === null ? (keys[e.key] > 0 ? -1 : n) : c) + keys[e.key])));
    } else if (e.key === 'Home') setCursor(0);
    else if (e.key === 'End') setCursor(n - 1);
    else if (e.key === 'Escape') setCursor(null);
  };

  const onPointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    setCursor(Math.min(n - 1, Math.max(0, Math.round(((px - PAD.left) / innerW) * (n - 1)))));
  };

  const readout =
    cursor === null
      ? null
      : `${date(days[cursor])}: ` +
        lines
          .map((l) => {
            const v = l.values[cursor];
            return `${l.name} ${v === null ? 'no data' : trend ? Math.round(v) : full(v)}`;
          })
          .join(' · ');

  return (
    <figure className="nl-chart" ref={boxRef}>
      <figcaption className="nl-chart__head">
        <span className="nl-caption">{trend ? 'Trend, indexed (first-week average = 100)' : title}</span>
        {canIndex ? (
          <span className="nl-toggle" role="group" aria-label="Chart scale">
            <button type="button" aria-pressed={!trend} onClick={() => setMode('absolute')}>
              Downloads
            </button>
            <button type="button" aria-pressed={trend} onClick={() => setMode('trend')}>
              Trend
            </button>
          </span>
        ) : null}
      </figcaption>

      <svg
        className="nl-chart__svg"
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        tabIndex={0}
        role="group"
        aria-label={`${trend ? 'Indexed trend' : title}. Use left and right arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onPointerMove={onPointer}
        onPointerLeave={() => setCursor(null)}
        onBlur={() => setCursor(null)}
      >
        {days.map((d, i) =>
          missingDays.has(d) ? <rect key={d} className="nl-chart__gap" x={x(i) - innerW / (2 * Math.max(1, n - 1))} y={PAD.top} width={innerW / Math.max(1, n - 1)} height={innerH} /> : null,
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line className="nl-chart__grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="nl-chart__tick" x={PAD.left - 6} y={y(t) + 3} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i, k) => (
          <text key={k} className="nl-chart__tick" x={x(i)} y={HEIGHT - 6} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}>
            {shortDay(days[i])}
          </text>
        ))}
        {lines.map((l) => (
          <g key={l.name}>
            <path d={pathFor(l.values)} className="nl-chart__line" style={{ stroke: l.color }} />
            {/* A reported day between two gaps has no segment, so mark it with a dot. */}
            {l.values.map((v, i) =>
              v !== null && (l.values[i - 1] ?? null) === null && (l.values[i + 1] ?? null) === null ? <circle key={i} cx={x(i)} cy={y(v)} r="2.5" style={{ fill: l.color }} /> : null,
            )}
          </g>
        ))}
        {cursor !== null ? (
          <g>
            <line className="nl-chart__cursor" x1={x(cursor)} x2={x(cursor)} y1={PAD.top} y2={PAD.top + innerH} />
            {lines.map((l) =>
              l.values[cursor] === null ? null : <circle key={l.name} cx={x(cursor)} cy={y(l.values[cursor])} r="3.5" style={{ fill: l.color }} className="nl-chart__dot" />,
            )}
          </g>
        ) : null}
      </svg>

      <p className="nl-chart__readout" aria-live="polite">
        {readout || ' '}
      </p>

      <ChartSummary lines={lines} days={days} trend={trend} missing={missingDays.size} />
    </figure>
  );
}

function ChartSummary({ lines, days, trend, missing }) {
  return (
    <div className="nl-chart__summary">
      {lines.length > 1 ? (
        <ul className="nl-legend">
          {lines.map((l) => (
            <li key={l.name}>
              <span className="nl-swatch" style={{ background: l.color }} aria-hidden="true" />
              <span className="nl-mono">{l.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="nl-muted nl-small">
        {lines
          .map((l) => {
            const vals = l.values.map((v, i) => [v, i]).filter(([v]) => v !== null);
            if (!vals.length) return `${l.name}: no data`;
            const [peak, at] = vals.reduce((a, b) => (b[0] > a[0] ? b : a));
            const total = l.days.reduce((s, d) => s + (d.missing ? 0 : d.downloads), 0);
            return trend
              ? `${l.name} peaked at ${Math.round(peak)} on ${shortDay(days[at])}`
              : `${l.name}: ${compact(total)} over ${vals.length} reported days, peak ${compact(peak)} on ${shortDay(days[at])}`;
          })
          .join('. ')}
        .{missing ? ` Shaded: ${missing} day${missing === 1 ? '' : 's'} npm reported no data for (not counted as zero).` : ''}
      </p>
    </div>
  );
}
