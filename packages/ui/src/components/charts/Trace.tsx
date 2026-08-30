import * as React from 'react';
import { cn } from '@/lib/utils';
import { createPath } from './path';
import { downsample } from './downsample';
import { paddedRange, type PaddedRange } from './range';
import { TraceScaleContext, type TraceScale } from './traceScale';
import './Trace.css';

/** The user space a trace is drawn in. It stretches to its container. */
const SVG_WIDTH = 400;
const DEFAULT_HEIGHT = 150;
/** Past this the extra samples land inside a pixel already drawn. */
const MAX_POINTS = 800;

export interface TraceProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  /** Samples, already smoothed if this signal is smoothed before it is read. */
  values: number[];
  /**
   * The vertical extent. Defaults to the samples' own range plus a tenth at
   * each end; `zeroAnchoredRange` is the other one worth naming.
   */
  domain?: PaddedRange;
  height?: number;
  /** Drawn layers, in the stretched user space. */
  children?: React.ReactNode;
  /** Labelling layers, in undistorted page type over the box. */
  overlay?: React.ReactNode;
}

/**
 * A signal, and whatever is drawn on it.
 *
 * The chart is the scale, not the marks: this owns the user space, the
 * domain, the thinning and the line's geometry, and every mark — bands, the
 * line, an area, a threshold, a labelled point — is a layer handed in as a
 * child. A new kind of reading is a new layer and an import, never a new
 * chart, which is what stopped the sensor traces and the rate track from
 * being two files with the same twenty lines of scaling in each.
 *
 * Layers arrive on two surfaces because there are genuinely two. The box is a
 * fixed user space stretched to whatever width it is given —
 * `preserveAspectRatio: none`, so strokes hold their weight through
 * `non-scaling-stroke` rather than thickening with the container — and type
 * set inside it would stretch with the width. So marks go in `children` and
 * anything with words in it goes in `overlay`, positioned in percentages over
 * the same box and set in the page's own tokens.
 */
const Trace = React.forwardRef<HTMLDivElement, TraceProps>(
  (
    {
      values,
      domain,
      height = DEFAULT_HEIGHT,
      children,
      overlay,
      className,
      ...props
    },
    ref,
  ) => {
    const points = React.useMemo(
      () => downsample(values, MAX_POINTS),
      [values],
    );
    const ownRange = React.useMemo(() => paddedRange(values), [values]);
    const { min, max } = domain ?? ownRange;

    const scale = React.useMemo<TraceScale>(() => {
      const span = max - min || 1;
      /*
       * Indices are placed against the samples handed in, never the thinned
       * ones, so a band lands where the line actually turns whether or not the
       * line under it was thinned. Both share this mapping, which is what
       * keeps a band edge on the sample it names.
       */
      const lastIndex = values.length - 1 || 1;
      const xOf = (index: number) => (index / lastIndex) * SVG_WIDTH;
      const yOf = (value: number) => height - ((value - min) / span) * height;
      return {
        values,
        points,
        path: createPath(points, SVG_WIDTH, height, min, max),
        width: SVG_WIDTH,
        height,
        min,
        max,
        xOf,
        yOf,
        leftOf: (index) => `${(xOf(index) / SVG_WIDTH) * 100}%`,
        topOf: (value) => `${(yOf(value) / height) * 100}%`,
      };
    }, [values, points, height, min, max]);

    return (
      <div className={cn('trace', className)} ref={ref} {...props}>
        <TraceScaleContext.Provider value={scale}>
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${height}`}
            preserveAspectRatio="none"
            style={{ height }}
            aria-hidden="true"
          >
            {children}
          </svg>
          {overlay != null && <div className="trace-overlay">{overlay}</div>}
        </TraceScaleContext.Provider>
      </div>
    );
  },
);

Trace.displayName = 'Trace';

export { Trace };
