/** `amount` is kcal for food and ml for water; `duration` is seconds spent eating or drinking. */
export const INTAKE_MEASURES = ['amount', 'duration'] as const;
export type IntakeMeasure = (typeof INTAKE_MEASURES)[number];

/**
 * The unit a day's total is kept in, given what each active device of that
 * class reports. A total is only meaningful when every contributor reports in
 * it, so one seconds-only device puts the whole class on `duration`. With no
 * devices, intake is whatever was logged by hand, which is an amount.
 *
 * TODO(design): a per-cat, per-device grams (or ml) per second estimate would
 * let a seconds-only device report an estimated amount, flagged as estimated,
 * and keep the class on `amount`.
 */
export function intakeMeasureOf(
  devices: ReadonlyArray<ReadonlyArray<IntakeMeasure>>,
): IntakeMeasure {
  const allReportAmount = devices.every((reports) =>
    reports.includes('amount'),
  );
  return allReportAmount ? 'amount' : 'duration';
}
