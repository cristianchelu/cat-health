import * as React from 'react';
import { cn } from '@/lib/utils';
import { useTraceScale } from './traceScale';

/**
 * The marks a {@link Trace} can be drawn from.
 *
 * Each one reads the scale off the trace it is inside and places itself; none
 * of them know about each other, so a chart is whichever of them a page names
 * and in what order. Adding a mark nobody has needed yet — a playhead, a
 * shaded selection, a second series — is a component here, not a chart.
 *
 * The ones that carry words go in the trace's `overlay`; the rest are SVG and
 * go in its `children`. Which surface a layer belongs on is written on it.
 */

export interface TraceBand {
  key: string;
  /** Sample indices into the trace's values, inclusive of `start`. */
  start: number;
  end: number;
  /** A CSS colour, normally one of theme.css's `--color-signal-*`. */
  color: string;
}

/** What an analyzer made of each stretch of the signal. Draw first, under the line. */
export const TraceBands: React.FC<{ bands: readonly TraceBand[] }> = ({
  bands,
}) => {
  const { xOf, width, height } = useTraceScale();
  return (
    <>
      {bands.map((band) => {
        const x = xOf(band.start);
        /* A band running to the last sample resolves a hair past the box; the
           clamp keeps its edge on the edge rather than just outside it. */
        const end = Math.min(xOf(band.end), width);
        return (
          <rect
            key={band.key}
            x={x}
            y={0}
            width={Math.max(end - x, 1)}
            height={height}
            fill={band.color}
          />
        );
      })}
    </>
  );
};

/** The signal itself. Draw last, so it stays readable over whatever is under it. */
export const TraceLine: React.FC<{
  tone?: string;
  strokeWidth?: number;
}> = ({ tone = 'var(--color-signal-line)', strokeWidth = 2.5 }) => {
  const { path } = useTraceScale();
  return (
    <path
      d={path}
      fill="none"
      stroke={tone}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );
};

/**
 * The line closed back to a baseline and filled.
 *
 * Worth having only where the distance from that baseline is the reading — a
 * rate against zero, not a weight against an arbitrary floor.
 */
export const TraceArea: React.FC<{
  tone?: string;
  baseline?: number;
  opacity?: number;
}> = ({ tone = 'var(--color-signal-line)', baseline = 0, opacity = 0.22 }) => {
  const { path, width, yOf } = useTraceScale();
  if (path === '') return null;
  const y = yOf(baseline);
  return (
    <path
      d={`${path} L ${width} ${y} L 0 ${y} Z`}
      fill={tone}
      opacity={opacity}
    />
  );
};

/**
 * A horizontal reference the signal is read against — a threshold, a zero.
 *
 * Dashed for a threshold, solid for an axis. A rule does not widen the
 * domain: a trace whose scale changed because of what was drawn on it would
 * be a different reading, so the caller includes the value in the domain
 * (see `zeroAnchoredRange`) when it must be on screen.
 */
export const TraceRule: React.FC<{
  value: number;
  tone?: string;
  dashed?: boolean;
}> = ({ value, tone = 'var(--color-border-hover)', dashed = true }) => {
  const { yOf, width } = useTraceScale();
  const y = yOf(value);
  return (
    <line
      x1={0}
      x2={width}
      y1={y}
      y2={y}
      stroke={tone}
      strokeWidth="1"
      strokeDasharray={dashed ? '3 3' : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
};

/**
 * What a {@link TraceRule} is, written on it.
 *
 * Under the rule rather than over: a domain is padded a tenth above whatever
 * is highest, so a threshold nobody reached sits within a few pixels of the
 * top and a label above it would be clipped away by the recess.
 */
export const TraceRuleLabel: React.FC<{
  value: number;
  children: React.ReactNode;
}> = ({ value, children }) => {
  const { topOf } = useTraceScale();
  return (
    <span className="trace-rule-label" style={{ top: topOf(value) }}>
      {children}
    </span>
  );
};

/** One sample worth naming, written beside the point it sits on. */
export const TraceMarker: React.FC<{
  /** Sample index into the trace's values. */
  index: number;
  /** `alert` for a reading the analyzer threw away. */
  tone?: 'series' | 'alert';
  children: React.ReactNode;
}> = ({ index, tone = 'series', children }) => {
  const { values, leftOf, topOf } = useTraceScale();
  const value = values[index];
  if (value == null) return null;
  /* Past halfway the label would run out of the box, so it changes which side
     of its own point it is written on. */
  const leading = index / (values.length - 1 || 1) >= 0.5;
  return (
    <span
      className={cn(
        'trace-marker',
        tone === 'alert' && 'alert',
        leading ? 'leading' : 'trailing',
      )}
      style={{ left: leftOf(index), top: topOf(value) }}
    >
      <span className="trace-marker-dot" aria-hidden="true" />
      <span className="trace-marker-label">{children}</span>
    </span>
  );
};

/** The two ends of the window the trace covers, on the floor of the box. */
export const TraceAxis: React.FC<{
  start?: React.ReactNode;
  end?: React.ReactNode;
}> = ({ start, end }) => (
  <>
    {start != null && <span className="trace-axis start">{start}</span>}
    {end != null && <span className="trace-axis end">{end}</span>}
  </>
);
