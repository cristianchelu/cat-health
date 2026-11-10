import type {
  WaterBandSetting,
  WaterPlan,
} from '../schemas/api/dietaryNeeds.ts';
import {
  bandAsSet,
  bandFromRange,
  customOrigin,
  range,
  times,
  type Band,
  type CustomOrigin,
  type IntakeGap,
  type PresetOrigin,
  type Range,
} from './band.ts';
import type { IntakePet } from './pet.ts';
import type { NutritionSourceId } from './sources.ts';

export const WATER_PRESETS = ['normal', 'uti_prone'] as const;
export type WaterPreset = (typeof WATER_PRESETS)[number];

/** One row of a source's table; only the formula is code. */
export interface WaterRow {
  preset: WaterPreset;
  /** Where the numbers are in the source. */
  ref: string;
  /** ml of total water a day, food moisture included. */
  mlPerDay(kg: number): Range;
}

/** Every row comes from `sourceId`, and a preset with no row is not answered. */
export interface WaterModel {
  sourceId: NutritionSourceId;
  rows: readonly WaterRow[];
}

const kosmal2025: WaterModel = {
  sourceId: 'kosmal-2025',
  rows: [
    {
      preset: 'normal',
      ref: 'Abstract, healthy cats',
      mlPerDay: (kg) => times(range(23, 51), kg),
    },
    {
      preset: 'uti_prone',
      ref: 'Abstract, USG below 1.035',
      mlPerDay: (kg) => times(range(42, 51), kg),
    },
  ],
};

/** Append-only: stored plans name these ids, so none is ever removed or reused. */
export const WATER_MODEL_IDS = ['kosmal-2025'] as const;
export type WaterModelId = (typeof WATER_MODEL_IDS)[number];

export const WATER_MODELS: Record<WaterModelId, WaterModel> = {
  'kosmal-2025': kosmal2025,
};

/** What a new pin gets; see `DEFAULT_ENERGY_PLAN`. */
export const DEFAULT_WATER_PLAN: WaterPlan = ['kosmal-2025'];

export type WaterOrigin =
  | PresetOrigin<WaterPreset, WaterModelId>
  | CustomOrigin;

/** A day's water band in ml. */
export interface WaterBand extends Band {
  unit: 'ml';
  origin: WaterOrigin;
}

/**
 * Her water band for the day, or the gap that leaves only a custom band. A
 * custom water band is set in ml per kg, so it scales with her weight. Water
 * has no floor.
 */
export function resolveWaterBand(
  setting: WaterBandSetting,
  plan: WaterPlan,
  pet: IntakePet,
): WaterBand | { gap: IntakeGap } {
  if (!('preset' in setting)) {
    const band = bandAsSet({
      target: setting.target * pet.kg,
      tolerance: setting.tolerance * pet.kg,
    });
    return { ...band, unit: 'ml', origin: customOrigin(setting) };
  }

  const answer = answerWater(plan, setting.preset, pet);
  if ('gap' in answer) return answer;

  const band = bandFromRange(answer.mlPerDay);
  return { ...band, unit: 'ml', origin: answer.origin };
}

export type WaterAnswer =
  | { mlPerDay: Range; origin: PresetOrigin<WaterPreset, WaterModelId> }
  | { gap: 'not_in_source' };

/** The ml a day from the first model in her plan with a row for this preset. */
export function answerWater(
  plan: WaterPlan,
  preset: WaterPreset,
  pet: IntakePet,
): WaterAnswer {
  for (const modelId of plan) {
    const { rows } = WATER_MODELS[modelId];
    const row = rows.find((candidate) => candidate.preset === preset);
    if (!row) continue;

    return {
      mlPerDay: row.mlPerDay(pet.kg),
      origin: { kind: 'preset', preset, modelId, ref: row.ref },
    };
  }
  return { gap: 'not_in_source' };
}
