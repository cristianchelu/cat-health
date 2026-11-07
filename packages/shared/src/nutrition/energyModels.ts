import type { EnergyStage } from './energyStage.ts';
import type { NutritionSourceId } from './sources.ts';

export const ENERGY_GOALS = ['maintain', 'lose'] as const;
export type EnergyGoal = (typeof ENERGY_GOALS)[number];

export interface EnergyCase {
  stage: EnergyStage;
  goal: EnergyGoal;
  kg: number;
  targetKg: number | null;
  /** Whole months of age; null when the birth date is unknown. */
  ageMonths: number | null;
}

/** kcal a day, unrounded. `tolerance` is null when the source gives one number. */
export interface EnergyAim {
  target: number;
  tolerance: number | null;
}

export type EnergyGap = 'not_in_source' | 'needs_target_weight';

export interface EnergyModel {
  sourceId: NutritionSourceId;
  /**
   * Every number used here comes from `sourceId`. A case the source does not
   * answer returns a gap rather than borrowing from elsewhere. A shipped model
   * never changes: a correction is a new id, and the golden tests hold that.
   */
  aim(c: EnergyCase): EnergyAim | EnergyGap;
}

function fromRange(low: number, high: number): EnergyAim {
  return { target: (low + high) / 2, tolerance: (high - low) / 2 };
}

/** Table VII-10, months of age to times MER. */
const FEDIAF_KITTEN_FACTORS: ReadonlyArray<{
  belowMonths: number;
  low: number;
  high: number;
}> = [
  { belowMonths: 4, low: 2.0, high: 2.5 },
  { belowMonths: 9, low: 1.75, high: 2.0 },
  { belowMonths: 12, low: 1.5, high: 1.5 },
];

const fediaf2025: EnergyModel = {
  sourceId: 'fediaf-2025',
  aim(c) {
    if (c.goal !== 'maintain') return 'not_in_source';
    const metabolicKg = c.kg ** 0.67;
    if (c.stage === 'growth') {
      if (c.ageMonths === null) return 'not_in_source';
      const age = c.ageMonths;
      const row = FEDIAF_KITTEN_FACTORS.find((r) => age < r.belowMonths);
      if (!row) return 'not_in_source';
      // "Times MER" is read as the 100 kcal/kg^0.67 the section assumes for normal adults.
      const mer = 100 * metabolicKg;
      if (row.low === row.high)
        return { target: row.low * mer, tolerance: null };
      return fromRange(row.low * mer, row.high * mer);
    }
    // Table VII-9 splits neutered or indoor cats from active ones, not intact from neutered.
    if (c.stage === 'adult_intact') return 'not_in_source';
    return fromRange(52 * metabolicKg, 75 * metabolicKg);
  },
};

const aahaRer = (kg: number): number => 70 * kg ** 0.75;

const AAHA_MAINTENANCE_FACTORS: Record<EnergyStage, [number, number] | null> = {
  growth: null,
  adult_neutered: [1.2, 1.4],
  adult_intact: [1.4, 1.6],
};

const aaha2021: EnergyModel = {
  sourceId: 'aaha-2021',
  aim(c) {
    if (c.goal === 'lose') {
      if (c.stage === 'growth') return 'not_in_source';
      // Box 1's 0.8, on ideal weight as the text asks; her target weight stands for it.
      if (c.targetKg === null) return 'needs_target_weight';
      return { target: 0.8 * aahaRer(c.targetKg), tolerance: null };
    }
    if (c.stage === 'growth')
      return { target: 2.5 * aahaRer(c.kg), tolerance: null };
    const factors = AAHA_MAINTENANCE_FACTORS[c.stage];
    if (!factors) return 'not_in_source';
    const rer = aahaRer(c.kg);
    return fromRange(factors[0] * rer, factors[1] * rer);
  },
};

/** Append-only: stored plans name these ids, so none is ever removed or reused. */
export const ENERGY_MODEL_IDS = ['fediaf-2025', 'aaha-2021'] as const;
export type EnergyModelId = (typeof ENERGY_MODEL_IDS)[number];

export const ENERGY_MODELS: Record<EnergyModelId, EnergyModel> = {
  'fediaf-2025': fediaf2025,
  'aaha-2021': aaha2021,
};
