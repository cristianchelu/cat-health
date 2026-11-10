/**
 * What a source says for a day, in the source's own unit. `low === high` when
 * it gives one number.
 */
export interface Range {
  low: number;
  high: number;
}

/** A source's low–high figure. */
export const range = (low: number, high: number): Range => ({ low, high });

/** A source's single figure, as a range of no width. */
export const point = (value: number): Range => ({ low: value, high: value });

/** A range of factors applied to one base, such as 1.2–1.4 × RER. */
export function times(factors: Range, base: number): Range {
  return { low: factors.low * base, high: factors.high * base };
}

/**
 * What the app changed after the source answered, so a band whose numbers are
 * not its source's own says so wherever it shows.
 */
export type BandAdjustment =
  /** The source gave one number, so the ± is the app's point tolerance. */
  | 'point_tolerance'
  /** The target was raised so the band clears `foodFloorKcal`. */
  | 'floor';

/**
 * A day's target ± tolerance, in whole units so the two add up to the bounds
 * wherever the band is shown.
 */
export interface Band {
  target: number;
  tolerance: number;
  adjustments: readonly BandAdjustment[];
}

/** The model row a preset's band came from; the model names the source to cite. */
export interface PresetOrigin<Preset extends string, ModelId extends string> {
  kind: 'preset';
  preset: Preset;
  modelId: ModelId;
  /** The row's `ref`. */
  ref: string;
}

/** A band set off the notches. */
export interface CustomOrigin {
  kind: 'custom';
  /** The vet visit event the numbers came from, or null when none is cited. */
  sourceEventId: number | null;
}

/** Why a preset has no band, which leaves only a custom one. */
export type IntakeGap = 'not_in_source' | 'needs_target_weight';

/**
 * The ± around a source that gives one number, as a share of that number. No
 * source gives this; a band needs some width, and `point_tolerance` marks it.
 */
const POINT_TOLERANCE_RATIO = 0.05;

/** A source's low–high as a band: the middle ± half the width, or ± the point tolerance around one number. */
export function bandFromRange(answer: Range): Band {
  const target = Math.round((answer.low + answer.high) / 2);
  if (answer.low === answer.high) {
    const tolerance = Math.round(target * POINT_TOLERANCE_RATIO);
    return { target, tolerance, adjustments: ['point_tolerance'] };
  }
  const tolerance = Math.round((answer.high - answer.low) / 2);
  return { target, tolerance, adjustments: [] };
}

/** A custom band as it was set, nothing adjusted. */
export function bandAsSet(set: { target: number; tolerance: number }): Band {
  return {
    target: Math.round(set.target),
    tolerance: Math.round(set.tolerance),
    adjustments: [],
  };
}

/** Raises the target until the whole band clears `floor`; the tolerance stays. */
export function liftAboveFloor(band: Band, floor: number): Band {
  const lowestTarget = floor + band.tolerance;
  if (band.target >= lowestTarget) return band;
  return {
    ...band,
    target: lowestTarget,
    adjustments: [...band.adjustments, 'floor'],
  };
}

/** The bounds a day is judged against. */
export function boundsOf(band: Band): { lower: number; upper: number } {
  return {
    lower: band.target - band.tolerance,
    upper: band.target + band.tolerance,
  };
}

/** The origin of a custom band, read off the setting's optional `source_event_id`. */
export function customOrigin(setting: {
  source_event_id?: number;
}): CustomOrigin {
  return { kind: 'custom', sourceEventId: setting.source_event_id ?? null };
}
