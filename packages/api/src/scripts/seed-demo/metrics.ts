/** Matches `WeightTrendCard` (`usePetWeightTrends(petId, 15)`). */
export const OVERVIEW_WEIGHT_TREND_DAYS = 15;

/** Default seed window — covers the weight chart with headroom. */
export const DEFAULT_SEED_DAYS = 30;

export const HEALTHY_WEIGHT_GRAMS = 4800;
const UTI_BASELINE_WEIGHT_GRAMS = 4200;
const UTI_ACUTE_WEIGHT_GRAMS = 4000;

export function pseudoRand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Multiplier in `[1 - spread, 1 + spread]`. */
export function dailyJitter(seed: number, spread: number): number {
  return 1 + (pseudoRand(seed) - 0.5) * 2 * spread;
}

export function waterBoundsFromWeightGrams(weightGrams: number): {
  lower: number;
  upper: number;
} {
  const weightKg = weightGrams / 1000;
  return { lower: weightKg * 40, upper: weightKg * 50 };
}

export function calorieBoundsFromWeightGrams(weightGrams: number): {
  lower: number;
  upper: number;
  target: number;
} {
  const weightKg = weightGrams / 1000;
  const target = 70 * weightKg ** 0.75;
  return { lower: target * 0.8, upper: target * 1.2, target };
}

function weightJitterGrams(seed: number, amplitude: number): number {
  return Math.round((pseudoRand(seed) - 0.5) * 2 * amplitude);
}

export function healthyWeightGramsForDay(dayIndex: number): number {
  return HEALTHY_WEIGHT_GRAMS + weightJitterGrams(dayIndex * 17 + 3, 35);
}

/** UTI: stable baseline, gradual loss over the last week, floor during acute days. */
export function utiWeightGramsForDay(
  dayIndex: number,
  totalDays: number,
): number {
  const acuteStart = totalDays - 2;
  const declineStart = Math.max(0, totalDays - 7);
  const jitter = weightJitterGrams(dayIndex * 23 + 11, 20);

  if (dayIndex >= acuteStart) {
    return UTI_ACUTE_WEIGHT_GRAMS + weightJitterGrams(dayIndex * 31, 15);
  }

  if (dayIndex >= declineStart && acuteStart > declineStart) {
    const progress =
      (dayIndex - declineStart) / Math.max(1, acuteStart - declineStart);
    const base = Math.round(
      UTI_BASELINE_WEIGHT_GRAMS -
        progress * (UTI_BASELINE_WEIGHT_GRAMS - UTI_ACUTE_WEIGHT_GRAMS),
    );
    return base + jitter;
  }

  return UTI_BASELINE_WEIGHT_GRAMS + jitter;
}

export function isAcuteUtiDay(dayIndex: number, totalDays: number): boolean {
  return dayIndex >= totalDays - 2;
}

/** 0 on first acute day, 1 on the last — null when not in the acute window. */
export function utiAcuteDayOffset(
  dayIndex: number,
  totalDays: number,
): number | null {
  const acuteStart = totalDays - 2;
  if (dayIndex < acuteStart) return null;
  return dayIndex - acuteStart;
}

/**
 * Severity for tapering acute UTI pee volume: worsens each unhealthy day and
 * across repeated visits the same day (dribbles, not full voids).
 */
export function utiAcutePeeSeverity(
  acuteDayOffset: number,
  visitIndex: number,
  visitCount: number,
): number {
  const acuteDays = 2;
  const dayProgress = acuteDayOffset / Math.max(1, acuteDays - 1);
  const visitProgress = visitCount > 1 ? visitIndex / (visitCount - 1) : 0;
  return Math.min(1, dayProgress * 0.6 + visitProgress * 0.4);
}

export interface DailyIntakeTargets {
  calories: number;
  waterMl: number;
}

export function healthyDailyTargets(dayIndex: number): DailyIntakeTargets {
  const calorieBounds = calorieBoundsFromWeightGrams(HEALTHY_WEIGHT_GRAMS);
  const waterBounds = waterBoundsFromWeightGrams(HEALTHY_WEIGHT_GRAMS);
  return {
    calories: Math.round(
      calorieBounds.target * 0.97 * dailyJitter(dayIndex * 41 + 7, 0.05),
    ),
    waterMl: Math.round(
      waterBounds.upper * 0.95 * dailyJitter(dayIndex * 53 + 13, 0.04),
    ),
  };
}

export function utiDailyTargets(
  dayIndex: number,
  totalDays: number,
): DailyIntakeTargets {
  const weight = utiWeightGramsForDay(dayIndex, totalDays);
  const calorieBounds = calorieBoundsFromWeightGrams(weight);
  const waterBounds = waterBoundsFromWeightGrams(weight);

  if (isAcuteUtiDay(dayIndex, totalDays)) {
    return {
      calories: Math.round(
        calorieBounds.lower * 0.72 * dailyJitter(dayIndex * 67 + 3, 0.06),
      ),
      waterMl: Math.round(
        waterBounds.lower * 0.58 * dailyJitter(dayIndex * 71 + 5, 0.07),
      ),
    };
  }

  return {
    calories: Math.round(
      calorieBounds.target * 0.94 * dailyJitter(dayIndex * 59 + 9, 0.05),
    ),
    waterMl: Math.round(
      ((waterBounds.lower + waterBounds.upper) / 2) *
        dailyJitter(dayIndex * 61 + 17, 0.04),
    ),
  };
}
