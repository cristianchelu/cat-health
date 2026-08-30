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
