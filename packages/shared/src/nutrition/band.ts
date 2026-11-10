/** A source's answer for a day; `low === high` when the source gives one number. */
export interface Range {
  low: number;
  high: number;
}

export const range = (low: number, high: number): Range => ({ low, high });
export const point = (value: number): Range => ({ low: value, high: value });

export function times(factors: Range, value: number): Range {
  return { low: factors.low * value, high: factors.high * value };
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

/** A day's target ± tolerance. */
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
  /** Where the numbers are in the source. */
  ref: string;
}

/** A band set off the notches, citing the vet visit when it names one. */
export interface CustomOrigin {
  kind: 'custom';
  sourceEventId: number | null;
}

/** Why a preset has no band, which leaves only a custom one. */
export type IntakeGap = 'not_in_source' | 'needs_target_weight';

/** The ± around a source that gives one number, as a share of that number. */
const POINT_TOLERANCE_RATIO = 0.05;

/** A source's low–high as a band: the middle ± half the width, or ± the point tolerance around one number. */
export function bandFromRange(answer: Range): Band {
  const target = (answer.low + answer.high) / 2;
  if (answer.low === answer.high) {
    const tolerance = target * POINT_TOLERANCE_RATIO;
    return { target, tolerance, adjustments: ['point_tolerance'] };
  }
  const tolerance = (answer.high - answer.low) / 2;
  return { target, tolerance, adjustments: [] };
}

/** A custom band, exactly as it was set. */
export function bandAsSet(set: { target: number; tolerance: number }): Band {
  return { target: set.target, tolerance: set.tolerance, adjustments: [] };
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

export function customOrigin(setting: {
  source_event_id?: number;
}): CustomOrigin {
  return { kind: 'custom', sourceEventId: setting.source_event_id ?? null };
}
