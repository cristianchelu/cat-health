export interface PaddedRange {
  min: number;
  max: number;
}

/**
 * Single pass. `Math.min(...arr)` spreads every sample onto the call stack,
 * which a several-thousand-sample trace overflows outright, and the
 * annotation chart recomputes this on every pointer frame during a drag.
 */
export function arrayMinMax(values: number[]): PaddedRange {
  if (values.length === 0) return { min: 0, max: 0 };
  let min = values[0]!;
  let max = values[0]!;
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * The vertical extent to draw a trace in: its own range, plus a tenth of that
 * range at each end so the line never runs along the edge of its box.
 *
 * A flat trace has no range to take a tenth of, so it gets a nominal one and
 * sits down the middle rather than collapsing onto a single row of pixels.
 */
export function paddedRange(values: number[]): PaddedRange {
  const { min, max } = arrayMinMax(values);
  const padding = (max - min || 1) * 0.1;
  return { min: min - padding, max: max + padding };
}

/**
 * The vertical extent for a signal read against zero rather than against
 * itself — a rate, a delta, anything whose distance from nothing is the
 * reading.
 *
 * `include` is for values that must be on screen even when the samples never
 * reach them: a threshold the trace is judged by is meaningless if it sits
 * outside the box. A series that never goes negative rests its floor exactly
 * on zero, which is where the eye expects it; one that does gets room under
 * it, or the dip is drawn along an edge and reads as clipped.
 */
export function zeroAnchoredRange(
  values: number[],
  include: readonly number[] = [],
): PaddedRange {
  const { min, max } = arrayMinMax(values);
  const lo = Math.min(0, min);
  let hi = Math.max(0, max);
  for (const value of include) hi = Math.max(hi, value);
  const padding = (hi - lo || 1) * 0.1;
  return { min: lo < 0 ? lo - padding : 0, max: hi + padding };
}
