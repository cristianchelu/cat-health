/**
 * The measurements the edit form can correct, and their legal windows.
 *
 * `weight` keeps its floor — no cat weighs half a kilo less than nothing —
 * but food and water start at 0 on purpose: zero is the answer for a bowl
 * refill the device misread as a meal or a draw.
 */
export type EditableMeasure = 'weight' | 'food' | 'water';

export interface MeasureRange {
  min: number;
  max: number;
}

/** Grams of food one sitting can plausibly cover. */
export const FOOD_AMOUNT_RANGE_G: MeasureRange = { min: 0, max: 1000 };
/** Millilitres of water one visit can plausibly cover. */
export const WATER_AMOUNT_RANGE_ML: MeasureRange = { min: 0, max: 2000 };

/** A rejected reading names its field, so the form can say which rule bit. */
export class MeasureOutOfRangeError extends Error {
  readonly measure: EditableMeasure;

  constructor(measure: EditableMeasure) {
    super(`${measure} measurement out of range`);
    this.measure = measure;
  }
}

/** `null` for anything that is not a number — amounts have no blank state. */
export function parseAmountInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const amount = Number.parseFloat(trimmed);
  return Number.isFinite(amount) ? amount : null;
}

/** The typed amount inside its window, or the error that names the field. */
export function requireAmount(
  text: string,
  range: MeasureRange,
  measure: EditableMeasure,
): number {
  const amount = parseAmountInput(text);
  if (amount == null || amount < range.min || amount > range.max) {
    throw new MeasureOutOfRangeError(measure);
  }
  return amount;
}
