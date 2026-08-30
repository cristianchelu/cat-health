import * as React from 'react';
import { cn } from '@/lib/utils';
import { createPath } from './path';
import { downsample } from './downsample';
import { arrayMinMax } from './range';
import type { SignalBand } from './SignalTrace';
import './RateTrace.css';

/** The width the trace is drawn in. It stretches to its container. */
const SVG_WIDTH = 400;
const DEFAULT_HEIGHT = 88;
/** Past this the extra samples land inside a pixel already drawn. */
const MAX_POINTS = 800;

export interface RateRule {
  key: string;
  /** In the series' own units. */
  value: number;
  /** Written along the rule; omitted leaves it a bare reference line. */
  label?: string;
}

export interface RateMarker {
  key: string;
  /** Sample index into `values`. */
  index: number;
  label: string;
  /** `alert` for a reading the analyzer threw away. */
  tone?: 'series' | 'alert';
}

interface RateTraceProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** A derived series — a slope, a rate — rather than a sensor's own samples. */
  values: number[];
  bands?: readonly SignalBand[];
  /** Horizontal references the series is read against, in its own units. */
  rules?: readonly RateRule[];
  /** Single samples worth naming, each written beside the point it sits on. */
  markers?: readonly RateMarker[];
  /** Captions under the two ends of the x axis. */
  axisStart?: string;
  axisEnd?: string;
  height?: number;
}

/**
 * A rate, against the thresholds that classified it.
 *
 * {@link SignalTrace}'s sibling rather than a mode of it. That one draws what
 * a sensor read and what its analyzer made of each stretch — bands and a line,
 * and nothing either of its callers wants beyond them. A rate is a *derived*
 * series, and the question it answers is how far it sat from the number that
 * classified it, so it fills to its own zero, carries the threshold as a drawn
 * rule, and names the samples the eye should land on. Folding four affordances
 * nobody else asked for into `SignalTrace` would cost both callers to serve
 * this one.
 *
 * The recess and its geometry are shared with `SignalTrace` by wearing its
 * class: two charts of the same signal sitting in two different wells is the
 * drift the shared palette was extracted to stop.
 *
 * Every label is HTML over the box, not `<text>` inside it. The box is a fixed
 * user space stretched to whatever width it is given, so type set inside it
 * would stretch with the container — and type set in the page's own tokens is
 * what the rest of the surface is set in anyway.
 */
const RateTrace = React.forwardRef<HTMLDivElement, RateTraceProps>(
  (
    {
      values,
      bands = [],
      rules = [],
      markers = [],
      axisStart,
      axisEnd,
      height = DEFAULT_HEIGHT,
      className,
      ...props
    },
    ref,
  ) => {
    const displayValues = React.useMemo(
      () => downsample(values, MAX_POINTS),
      [values],
    );

    /*
     * Anchored at zero rather than padded around the data: a rate chart read
     * off a floating baseline says nothing about how much water moved, and the
     * threshold has to be inside the box or the trace is read against an edge
     * it cannot see.
     */
    const { min, max } = React.useMemo(() => {
      const extent = arrayMinMax(values);
      const lo = Math.min(0, extent.min);
      let hi = Math.max(0, extent.max);
      for (const rule of rules) hi = Math.max(hi, rule.value);
      const padding = (hi - lo || 1) * 0.1;
      return {
        /* A series that never goes negative rests its fill on the floor of the
           box, which is where zero belongs. One that does gets room under it,
           or the dip is drawn along an edge and reads as clipped. */
        min: lo < 0 ? lo - padding : 0,
        max: hi + padding,
      };
    }, [values, rules]);

    const yOf = React.useCallback(
      (value: number) => height - ((value - min) / (max - min || 1)) * height,
      [height, min, max],
    );
    /** Percent down the box, which is what the overlay is positioned in. */
    const topOf = React.useCallback(
      (value: number) => `${(yOf(value) / height) * 100}%`,
      [yOf, height],
    );
    const leftOf = React.useCallback(
      (index: number) => `${(index / (values.length - 1 || 1)) * 100}%`,
      [values.length],
    );

    const linePath = React.useMemo(
      () => createPath(displayValues, SVG_WIDTH, height, min, max),
      [displayValues, height, min, max],
    );
    /* Closed back along zero, so the fill measures the series against the
       baseline rather than against the bottom of whatever box it landed in. */
    const zeroY = yOf(0);
    const areaPath = linePath
      ? `${linePath} L ${SVG_WIDTH} ${zeroY} L 0 ${zeroY} Z`
      : '';

    /* Bands are indexed against the samples handed in, not the downsampled
       ones, so they are placed against that length. */
    const perSample = values.length > 0 ? SVG_WIDTH / values.length : 0;

    return (
      <div
        className={cn('signal-trace', 'rate-trace', className)}
        ref={ref}
        {...props}
      >
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          preserveAspectRatio="none"
          style={{ height }}
          aria-hidden="true"
        >
          {bands.map((band) => (
            <rect
              key={band.key}
              x={band.start * perSample}
              y={0}
              width={Math.max((band.end - band.start) * perSample, 1)}
              height={height}
              fill={band.color}
            />
          ))}
          {rules.map((rule) => (
            <line
              key={rule.key}
              x1={0}
              x2={SVG_WIDTH}
              y1={yOf(rule.value)}
              y2={yOf(rule.value)}
              stroke="var(--color-border-hover)"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={0}
            x2={SVG_WIDTH}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--color-border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <path d={areaPath} fill="var(--color-water)" opacity="0.22" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-water)"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="rate-trace-overlay">
          {rules.map(
            (rule) =>
              rule.label != null && (
                <span
                  className="rate-trace-rule-label"
                  key={rule.key}
                  style={{ top: topOf(rule.value) }}
                >
                  {rule.label}
                </span>
              ),
          )}
          {markers.map((marker) => {
            const value = values[marker.index];
            if (value == null) return null;
            /* Past halfway the label would run out of the box, so it changes
               which side of its own point it is written on. */
            const trailing = marker.index / (values.length - 1 || 1) < 0.5;
            return (
              <span
                className={cn(
                  'rate-trace-marker',
                  marker.tone === 'alert' && 'alert',
                  trailing ? 'trailing' : 'leading',
                )}
                key={marker.key}
                style={{ left: leftOf(marker.index), top: topOf(value) }}
              >
                <span className="rate-trace-marker-dot" aria-hidden="true" />
                <span className="rate-trace-marker-label">{marker.label}</span>
              </span>
            );
          })}
          {axisStart != null && (
            <span className="rate-trace-axis start">{axisStart}</span>
          )}
          {axisEnd != null && (
            <span className="rate-trace-axis end">{axisEnd}</span>
          )}
        </div>
      </div>
    );
  },
);

RateTrace.displayName = 'RateTrace';

export { RateTrace };
