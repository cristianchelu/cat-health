/**
 * The app's own rules, applied after any model has answered. They are policy,
 * not citations, and are labelled that way wherever they show.
 */
export const INTAKE_GUARDS = {
  /** No food band reaches below this × the reference RER. */
  floorRerFactor: 0.6,
  /** A target weight is at least this share of her current weight. */
  lowestTargetWeightRatio: 0.7,
  /** The ± around a source that gives one number instead of a range. */
  pointToleranceRatio: 0.05,
  kcalStep: 5,
  mlStep: 5,
} as const;

/** The guards' yardstick, so the floor does not depend on which model answered. */
export function referenceRer(kg: number): number {
  return 70 * kg ** 0.75;
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Lowest daily kcal any food band may reach, at her target weight when one is set. */
export function foodFloorKcal(kg: number, targetKg: number | null): number {
  const floor = INTAKE_GUARDS.floorRerFactor * referenceRer(targetKg ?? kg);
  return Math.ceil(floor / INTAKE_GUARDS.kcalStep) * INTAKE_GUARDS.kcalStep;
}

export function lowestTargetWeightKg(kg: number): number {
  return Math.round(kg * INTAKE_GUARDS.lowestTargetWeightRatio * 10) / 10;
}

/** A target weight counts only below her weight and no lower than the guard allows. */
export function isValidTargetWeight(kg: number, targetKg: number): boolean {
  return targetKg < kg && targetKg >= lowestTargetWeightKg(kg);
}
