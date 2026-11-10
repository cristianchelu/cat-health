import type {
  EnergyPlan,
  FoodBandSetting,
} from '../schemas/api/dietaryNeeds.ts';
import {
  bandAsSet,
  bandFromRange,
  customOrigin,
  liftAboveFloor,
  point,
  range,
  times,
  type Band,
  type CustomOrigin,
  type IntakeGap,
  type PresetOrigin,
  type Range,
} from './band.ts';
import type { Altered, IntakePet } from './pet.ts';
import type { NutritionModel, NutritionModelRow } from './sources.ts';

/**
 * The notches on the food band. Sources publish energy needs, so what answers
 * a preset is an energy model, row and plan; what it feeds is the food band.
 */
export const FOOD_PRESETS = ['maintain', 'lose'] as const;
export type FoodPreset = (typeof FOOD_PRESETS)[number];

/** Months of age, from inclusive to below. */
export type AgeRange = readonly [from: number, below: number];

/** A kitten until her first birthday, an adult from then on: `aaha-aafp-life-stage-2021`, Table 1. */
const KITTEN: AgeRange = [0, 12];
const ADULT: AgeRange = [12, Infinity];

/**
 * One row of a source's energy table. What the row covers is data, so a model
 * can be read against its document.
 */
export interface EnergyRow extends NutritionModelRow {
  preset: FoodPreset;
  /** The ages the row is for; `coversAge` says how a cat of unknown age is matched. */
  age: AgeRange;
  /** Whether the row is for altered or intact cats, or `any` when the source doesn't split on it. */
  altered: Altered | 'any';
  /** The weight the formula takes: hers, or her target weight where the source asks for ideal weight. */
  weight: 'current' | 'target';
  /** kcal a day at `kg`, the weight `weight` selects. */
  kcalPerDay(kg: number): Range;
}

/** A source's energy table: each row is kcal a day for one kind of cat. */
export type EnergyModel = NutritionModel<EnergyRow>;

/**
 * FEDIAF's MER, which Table VII-10's kitten factors multiply. Read as the
 * 100 kcal/kg^0.67 section 7.2.4.2 assumes for normal active adults.
 */
const fediafMer = (kg: number): number => 100 * kg ** 0.67;

const fediaf2025: EnergyModel = {
  sourceId: 'fediaf-2025',
  rows: [
    {
      preset: 'maintain',
      age: ADULT,
      altered: 'altered',
      weight: 'current',
      ref: 'Table VII-9, neutered and/or indoor',
      kcalPerDay: (kg) => times(range(52, 75), kg ** 0.67),
    },
    {
      preset: 'maintain',
      age: [0, 4],
      altered: 'any',
      weight: 'current',
      ref: 'Table VII-10, up to 4 months',
      kcalPerDay: (kg) => times(range(2.0, 2.5), fediafMer(kg)),
    },
    {
      preset: 'maintain',
      age: [4, 9],
      altered: 'any',
      weight: 'current',
      ref: 'Table VII-10, 4 to 9 months',
      kcalPerDay: (kg) => times(range(1.75, 2.0), fediafMer(kg)),
    },
    {
      preset: 'maintain',
      age: [9, 12],
      altered: 'any',
      weight: 'current',
      ref: 'Table VII-10, 9 to 12 months',
      kcalPerDay: (kg) => times(point(1.5), fediafMer(kg)),
    },
  ],
};

/** AAHA 2021's RER, Box 1. The food floor measures against it too. */
export const aahaRer = (kg: number): number => 70 * kg ** 0.75;

const aaha2021: EnergyModel = {
  sourceId: 'aaha-2021',
  rows: [
    {
      preset: 'maintain',
      age: ADULT,
      altered: 'altered',
      weight: 'current',
      ref: 'Box 1, neutered adults',
      kcalPerDay: (kg) => times(range(1.2, 1.4), aahaRer(kg)),
    },
    {
      preset: 'maintain',
      age: ADULT,
      altered: 'intact',
      weight: 'current',
      ref: 'Box 1, intact adult',
      kcalPerDay: (kg) => times(range(1.4, 1.6), aahaRer(kg)),
    },
    {
      preset: 'maintain',
      age: KITTEN,
      altered: 'any',
      weight: 'current',
      ref: 'Box 1, growth',
      kcalPerDay: (kg) => times(point(2.5), aahaRer(kg)),
    },
    {
      preset: 'lose',
      age: ADULT,
      altered: 'any',
      weight: 'target',
      ref: 'Box 1, weight loss; p. 9, on ideal weight',
      kcalPerDay: (kg) => times(point(0.8), aahaRer(kg)),
    },
  ],
};

/** The ids a stored plan may name; `NutritionModel` has the rule for changing them. */
export const ENERGY_MODEL_IDS = ['fediaf-2025', 'aaha-2021'] as const;
export type EnergyModelId = (typeof ENERGY_MODEL_IDS)[number];

export const ENERGY_MODELS: Record<EnergyModelId, EnergyModel> = {
  'fediaf-2025': fediaf2025,
  'aaha-2021': aaha2021,
};

/**
 * What a new pin gets. Pets are pinned to the plan of the day by an event, so
 * changing this only reaches pets pinned afterwards.
 */
export const DEFAULT_ENERGY_PLAN: EnergyPlan = ['fediaf-2025', 'aaha-2021'];

/**
 * No food band reaches below this × RER at her ideal weight. It is the lowest
 * restriction `aaha-2014` calls tolerated (Monitoring and Maintenance); below
 * it the guideline warns of nutrient deficiency and, in cats, hepatic lipidosis.
 */
const FLOOR_RER_FACTOR = 0.6;

/** Where a food band's numbers came from: a model row, or a custom setting. */
export type FoodOrigin = PresetOrigin<FoodPreset, EnergyModelId> | CustomOrigin;

/** A day's food band in kcal. */
export interface FoodBand extends Band {
  unit: 'kcal';
  origin: FoodOrigin;
}

/**
 * Her food band for the day, or the gap that leaves only a custom band. A
 * preset is what her plan answers and a custom band is what was set; either
 * is kept above her floor.
 */
export function resolveFoodBand(
  setting: FoodBandSetting,
  plan: EnergyPlan,
  pet: IntakePet,
): FoodBand | { gap: IntakeGap } {
  const floor = foodFloorKcal(pet);

  if (!('preset' in setting)) {
    const band = liftAboveFloor(bandAsSet(setting), floor);
    return { ...band, unit: 'kcal', origin: customOrigin(setting) };
  }

  const answer = answerEnergy(plan, setting.preset, pet);
  if ('gap' in answer) return answer;

  const band = liftAboveFloor(bandFromRange(answer.kcalPerDay), floor);
  return { ...band, unit: 'kcal', origin: answer.origin };
}

/** What a plan says for one preset and cat: the source's kcal a day and the row it came from, or why there is none. */
export type EnergyAnswer =
  | { kcalPerDay: Range; origin: PresetOrigin<FoodPreset, EnergyModelId> }
  | { gap: IntakeGap };

/**
 * The kcal a day from the first model in her plan with a row for this preset. A
 * row that needs a target weight she has not set stops the walk rather than
 * handing her to a less preferred model.
 */
export function answerEnergy(
  plan: EnergyPlan,
  preset: FoodPreset,
  pet: IntakePet,
): EnergyAnswer {
  for (const modelId of plan) {
    const { rows } = ENERGY_MODELS[modelId];
    const row = rows.find((candidate) => rowCovers(candidate, preset, pet));
    if (!row) continue;

    const kg = row.weight === 'target' ? pet.targetKg : pet.kg;
    if (kg === null) return { gap: 'needs_target_weight' };
    return {
      kcalPerDay: row.kcalPerDay(kg),
      origin: { kind: 'preset', preset, modelId, ref: row.ref },
    };
  }
  return { gap: 'not_in_source' };
}

/** Whether `row` answers this preset for her age and for altered or intact as she is. */
function rowCovers(
  row: EnergyRow,
  preset: FoodPreset,
  pet: IntakePet,
): boolean {
  if (row.preset !== preset) return false;
  if (row.altered !== 'any' && row.altered !== pet.altered) return false;
  return coversAge(row.age, pet.ageMonths);
}

/** A cat of unknown age is an adult of unknown age, so only a row for every adult age covers her. */
function coversAge([from, below]: AgeRange, ageMonths: number | null): boolean {
  if (ageMonths === null) return from <= ADULT[0] && below >= ADULT[1];
  return ageMonths >= from && ageMonths < below;
}

/**
 * Lowest whole kcal a day any food band may reach, whichever model answered.
 * Her ideal weight is her target weight when one is set and her own weight
 * otherwise; `aaha-2014` measures restriction against ideal weight, never
 * current weight, so a heavier cat does not get a higher floor.
 */
export function foodFloorKcal(pet: IntakePet): number {
  return Math.ceil(FLOOR_RER_FACTOR * aahaRer(pet.targetKg ?? pet.kg));
}
