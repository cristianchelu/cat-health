import * as React from 'react';
import { cn } from '@/lib/utils';
import { createPath } from './path';
import { downsample } from './downsample';
import { paddedRange } from './range';
import './SignalTrace.css';

/** The width the trace is drawn in. It stretches to its container. */
const SVG_WIDTH = 400;
const DEFAULT_HEIGHT = 150;
/** Past this the extra samples land inside a pixel already drawn. */
const MAX_POINTS = 800;

export interface SignalBand {
  key: string;
  /** Sample indices into `values`, inclusive of `start`. */
  start: number;
  end: number;
  /** A CSS colour, normally one of theme.css's `--color-signal-*`. */
  color: string;
}

interface SignalTraceProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  /** Samples, already smoothed if this signal is smoothed before it is read. */
  values: number[];
  /** What the device's analyzer made of each stretch of the trace. */
  bands?: readonly SignalBand[];
  height?: number;
}

/**
 * A sensor's trace: what its analyzer made of each stretch, and the line.
 *
 * The read-only half of what the annotation workspace draws, without any of
 * the parts that let you edit it. Bands go down first and the line over them,
 * so the line stays readable wherever two bands meet.
 *
 * The box is a fixed user space stretched to whatever width it is given —
 * `preserveAspectRatio: none`, so the line thickens with `non-scaling-stroke`
 * rather than with the container.
 */
const SignalTrace = React.forwardRef<HTMLDivElement, SignalTraceProps>(
  (
    { values, bands = [], height = DEFAULT_HEIGHT, className, ...props },
    ref,
  ) => {
    const displayValues = React.useMemo(
      () => downsample(values, MAX_POINTS),
      [values],
    );
    const { min, max } = React.useMemo(() => paddedRange(values), [values]);
    const linePath = React.useMemo(
      () => createPath(displayValues, SVG_WIDTH, height, min, max),
      [displayValues, height, min, max],
    );

    /* Bands are indexed against the samples handed in, not the downsampled
       ones, so they are placed against that length and never need to know
       whether the line under them was thinned. */
    const perSample = values.length > 0 ? SVG_WIDTH / values.length : 0;

    return (
      <div className={cn('signal-trace', className)} ref={ref} {...props}>
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
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-signal-line)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  },
);

SignalTrace.displayName = 'SignalTrace';

export { SignalTrace };
