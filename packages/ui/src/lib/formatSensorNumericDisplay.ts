export interface SensorNumericFormatOptions {
  /** ESPHome sensor list metadata (`accuracy_decimals` in YAML). */
  accuracyDecimals?: number;
  /** ESPHome number entity `step`; used to infer decimal places when accuracy is unknown. */
  step?: number;
  /** ESPHome `unit_of_measurement` — improves rounding when firmware omits `accuracy_decimals`. */
  unit?: string;
  /** ESPHome `device_class` — improves rounding when firmware omits `accuracy_decimals`. */
  deviceClass?: string;
}

const MAX_ACCURACY_DECIMALS = 15;
const MAX_INFERRED_DECIMALS = 12;
/** Fallback when no accuracy / step / heuristic applies */
const FALLBACK_MAX_SIG_DIGITS = 5;
const FALLBACK_MAX_FRACTION_DIGITS = 2;

/** Decimal places by HA-ish sensor device_class when nothing better is known */
const DEVICE_CLASS_DECIMALS: Readonly<Record<string, number>> = {
  temperature: 1,
  humidity: 1,
  moisture: 1,
  battery: 1,
  voltage: 2,
  current: 2,
  power: 2,
  energy: 2,
  pressure: 1,
  distance: 2,
  weight: 2,
  gas: 2,
  volume_storage: 1,
  volume_flow_rate: 1,
  water: 1,
  timestamp: 0,
};

function clampAccuracyDecimals(n: number): number {
  return Math.min(
    MAX_ACCURACY_DECIMALS,
    Math.max(0, Math.floor(n)),
  );
}

function roundToDecimals(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const rounded =
    Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function heuristicFractionDigits(
  unit?: string,
  deviceClass?: string,
): number | undefined {
  const dc = deviceClass?.trim().toLowerCase();
  if (dc && dc in DEVICE_CLASS_DECIMALS) {
    return DEVICE_CLASS_DECIMALS[dc];
  }

  const u = unit?.trim().toLowerCase();
  if (!u) return undefined;
  if (u.includes('%')) return 1;
  if (
    u === '°c' ||
    u === '°f' ||
    u === '℃' ||
    u.endsWith('°c') ||
    u.endsWith('°f')
  ) {
    return 1;
  }
  if (
    u === 'ml' ||
    u === 'l' ||
    u === 'gal' ||
    u === 'fl oz' ||
    u === 'm³' ||
    u === 'ft³'
  ) {
    return 1;
  }

  return undefined;
}

/**
 * How many fractional digits a positive `step` implies (e.g. 0.05 → 2).
 */
export function decimalsImpliedByStep(step: number): number | undefined {
  if (!Number.isFinite(step) || step <= 0) {
    return undefined;
  }

  let n = 0;
  let s = step;
  while (
    n < MAX_INFERRED_DECIMALS &&
    Math.abs(s - Math.round(s)) > 1e-9 * Math.max(1, Math.abs(s))
  ) {
    s *= 10;
    n += 1;
  }

  return n;
}

export function resolveSensorDecimalPlaces(
  options?: SensorNumericFormatOptions,
): number | undefined {
  if (
    options?.accuracyDecimals !== undefined &&
    Number.isFinite(options.accuracyDecimals)
  ) {
    return clampAccuracyDecimals(options.accuracyDecimals);
  }

  const fromStep = decimalsImpliedByStep(options?.step ?? NaN);
  if (fromStep !== undefined) {
    return fromStep;
  }

  const fromHint = heuristicFractionDigits(options?.unit, options?.deviceClass);
  if (fromHint !== undefined) {
    return Math.min(MAX_ACCURACY_DECIMALS, Math.max(0, Math.floor(fromHint)));
  }

  return undefined;
}

/**
 * Rounds a numeric entity reading for controls (e.g. number inputs) using the same rules as display text.
 */
export function roundEntityNumericValue(
  value: number,
  options?: SensorNumericFormatOptions,
): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const decimals = resolveSensorDecimalPlaces(options);
  if (decimals !== undefined) {
    return roundToDecimals(value, decimals);
  }

  const text = formatSensorNumericDisplay(value, options);
  const normalized = text.replace(/,/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : value;
}

/**
 * Human-readable sensor / numeric entity value: honors ESPHome accuracy when present,
 * otherwise infers from `step`, otherwise unit/device_class heuristic,
 * otherwise caps precision via `Intl`.
 */
export function formatSensorNumericDisplay(
  value: number,
  options?: SensorNumericFormatOptions,
): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const decimals = resolveSensorDecimalPlaces(options);

  if (decimals !== undefined) {
    const rounded = roundToDecimals(value, decimals);
    let s = rounded.toFixed(decimals);
    if (decimals > 0) {
      s = s.replace(/\.?0+$/, '');
    }
    return s;
  }

  return new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: FALLBACK_MAX_SIG_DIGITS,
    maximumFractionDigits: FALLBACK_MAX_FRACTION_DIGITS,
  }).format(value);
}
