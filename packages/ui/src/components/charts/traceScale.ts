import * as React from 'react';

/**
 * Everything a layer needs to place itself, resolved once per trace.
 *
 * The contract between a {@link Trace} and the marks drawn on it, and the
 * reason neither has to know what the other is: a layer asks the scale where
 * a sample index or a value lands and draws itself there.
 *
 * The two coordinate systems are both here on purpose. `xOf`/`yOf` are the
 * stretched user space the SVG layers draw in; `leftOf`/`topOf` are the same
 * positions as percentages, which is what the overlay's undistorted HTML is
 * placed with. A layer picks the pair that matches the surface it is on.
 */
export interface TraceScale {
  /** Samples as handed in — what band and marker indices count against. */
  values: number[];
  /** Thinned for drawing. */
  points: number[];
  /** The line through `points`, as an SVG `d`; shared so it is built once. */
  path: string;
  width: number;
  height: number;
  min: number;
  max: number;
  xOf: (index: number) => number;
  yOf: (value: number) => number;
  leftOf: (index: number) => string;
  topOf: (value: number) => string;
}

export const TraceScaleContext = React.createContext<TraceScale | null>(null);

/** The scale a layer is being drawn against. Throws outside a `Trace`. */
export function useTraceScale(): TraceScale {
  const scale = React.useContext(TraceScaleContext);
  if (scale === null) {
    throw new Error('A trace layer must be rendered inside a <Trace>.');
  }
  return scale;
}
