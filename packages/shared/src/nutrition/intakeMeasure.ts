import type { CustomBandSetting } from '../schemas/api/dietaryNeeds.ts';
import {
  bandAsSet,
  customOrigin,
  type Band,
  type CustomOrigin,
} from './band.ts';

/** `amount` is kcal for food and ml for water; `duration` is seconds spent eating or drinking. */
export const INTAKE_MEASURES = ['amount', 'duration'] as const;
/** What a day's food or water total is counted in. */
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

/** A day's band in seconds spent eating or drinking. */
export interface DurationBand extends Band {
  unit: 's';
  origin: CustomOrigin;
}

/** No source gives seconds a day, so a duration band is custom only. */
export function resolveDurationBand(setting: CustomBandSetting): DurationBand {
  return { ...bandAsSet(setting), unit: 's', origin: customOrigin(setting) };
}
