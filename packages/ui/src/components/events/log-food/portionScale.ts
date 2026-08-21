/**
 * The slider's range and stops for one food.
 *
 * With a serving size recorded, the track is exactly one pouch and the stops
 * are its quarters. Without a serving size there is no landmark to snap to,
 * so it degrades to a plain gram slider rather than inventing fractions of
 * nothing; the tappable value is the way past either range.
 */
export interface PortionScale {
  max: number;
  detents: number[];
  /** Labels for the fraction stops, keyed by their gram value. */
  labels: Map<number, string>;
  /** The stop that means one whole serving, if there is one. */
  pouchLabelValue: number | null;
}

/** Range for a food with no serving size: a plain gram slider. */
const PLAIN_MAX_GRAMS = 100;

const FRACTION_LABELS: ReadonlyArray<[number, string]> = [
  [0, '0'],
  [0.25, '¼'],
  [0.5, '½'],
  [0.75, '¾'],
];

export function buildPortionScale(servingSizeG: number | null): PortionScale {
  if (servingSizeG == null || servingSizeG <= 0) {
    return {
      max: PLAIN_MAX_GRAMS,
      detents: [],
      labels: new Map(),
      pouchLabelValue: null,
    };
  }

  const serving = Math.round(servingSizeG);
  const detents: number[] = [];
  for (let quarter = 0; quarter <= 4; quarter++) {
    const grams = Math.round((serving * quarter) / 4);
    if (detents.at(-1) !== grams) detents.push(grams);
  }

  const labels = new Map<number, string>();
  for (const [fraction, label] of FRACTION_LABELS) {
    labels.set(Math.round(serving * fraction), label);
  }

  return { max: serving, detents, labels, pouchLabelValue: serving };
}
