/**
 * The measurements the edit form can correct, and their legal windows.
 *
 * `weight` keeps its floor — no cat weighs half a kilo less than nothing —
 * but food and water start at 0 on purpose: zero is the answer for a bowl
 * refill the device misread as a meal or a draw.
 */
export type EditableMeasure = 'weight' | 'food' | 'water';

/** Grams of food one sitting can plausibly cover. */
export const FOOD_AMOUNT_RANGE_G = { min: 0, max: 1000 } as const;
/** Millilitres of water one visit can plausibly cover. */
export const WATER_AMOUNT_RANGE_ML = { min: 0, max: 2000 } as const;

/** A rejected reading names its field, so the form can say which rule bit. */
export class MeasureOutOfRangeError extends Error {
  readonly measure: EditableMeasure;

  constructor(measure: EditableMeasure) {
    super(`${measure} measurement out of range`);
    this.measure = measure;
  }
}
