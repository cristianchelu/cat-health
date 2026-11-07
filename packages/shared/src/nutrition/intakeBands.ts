import type {
  CustomBandSetting,
  EnergyPlan,
  FoodBandSetting,
  WaterBandSetting,
  WaterPlan,
} from '../schemas/api/dietaryNeeds.ts';
import {
  ENERGY_MODELS,
  type EnergyGap,
  type EnergyGoal,
  type EnergyModelId,
} from './energyModels.ts';
import type { EnergyStage } from './energyStage.ts';
import {
  INTAKE_GUARDS,
  foodFloorKcal,
  isValidTargetWeight,
  roundTo,
} from './intakeGuards.ts';
import type { NutritionSourceId } from './sources.ts';
import {
  WATER_MODELS,
  type WaterModelId,
  type WaterPreset,
} from './waterModels.ts';

export type BandUnit = 'kcal' | 'ml' | 's';

export type BandOrigin =
  | {
      kind: 'food_preset';
      preset: EnergyGoal;
      stage: EnergyStage;
      modelId: EnergyModelId;
      sourceId: NutritionSourceId;
      /** The source gave one number, so the ± is the app's point tolerance. */
      pointTolerance: boolean;
    }
  | {
      kind: 'water_preset';
      preset: WaterPreset;
      modelId: WaterModelId;
      sourceId: NutritionSourceId;
    }
  | { kind: 'custom'; sourceEventId: number | null };

/** A day's band, in the day's unit. */
export interface ResolvedBand {
  target: number;
  tolerance: number;
  lower: number;
  upper: number;
  unit: BandUnit;
  origin: BandOrigin;
  /** The floor guard lifted the target. */
  floored: boolean;
}

/** No model in the plan answers this case, so only a custom band is possible. */
export interface UncoveredBand {
  uncovered: { stage: EnergyStage; goal: EnergyGoal; gap: EnergyGap };
}

export interface FoodContext {
  kg: number;
  /** Ignored unless `isValidTargetWeight` accepts it. */
  targetKg: number | null;
  stage: EnergyStage;
  ageMonths: number | null;
}

export interface FoodPresetAim {
  target: number;
  tolerance: number;
  stage: EnergyStage;
  modelId: EnergyModelId;
  pointTolerance: boolean;
  floored: boolean;
}

function usableTargetKg(ctx: FoodContext): number | null {
  if (ctx.targetKg === null) return null;
  return isValidTargetWeight(ctx.kg, ctx.targetKg) ? ctx.targetKg : null;
}

/** The band never dips below the floor: the target rises instead. */
function lifted(
  target: number,
  tolerance: number,
  floor: number,
): { target: number; floored: boolean } {
  if (target - tolerance >= floor) return { target, floored: false };
  return { target: floor + tolerance, floored: true };
}

/**
 * Where a food notch sits for her today: the first model in the plan's row
 * that answers, rounded and floored. The slider's notches and the resolved
 * band both come from here, so a target on a notch is exactly that notch.
 */
export function foodPresetAim(
  plan: EnergyPlan,
  goal: EnergyGoal,
  ctx: FoodContext,
): FoodPresetAim | UncoveredBand {
  const targetKg = usableTargetKg(ctx);
  const energyCase = { ...ctx, targetKg, goal };
  let gap: EnergyGap = 'not_in_source';
  for (const modelId of plan[ctx.stage][goal] ?? []) {
    const aim = ENERGY_MODELS[modelId].aim(energyCase);
    if (typeof aim === 'string') {
      if (aim === 'needs_target_weight') gap = aim;
      continue;
    }
    const target = roundTo(aim.target, INTAKE_GUARDS.kcalStep);
    const rawTolerance =
      aim.tolerance ?? aim.target * INTAKE_GUARDS.pointToleranceRatio;
    const tolerance = roundTo(rawTolerance, INTAKE_GUARDS.kcalStep);
    const floor = foodFloorKcal(ctx.kg, targetKg);
    return {
      ...lifted(target, tolerance, floor),
      tolerance,
      stage: ctx.stage,
      modelId,
      pointTolerance: aim.tolerance === null,
    };
  }
  return { uncovered: { stage: ctx.stage, goal, gap } };
}

function customOrigin(setting: CustomBandSetting): BandOrigin {
  return { kind: 'custom', sourceEventId: setting.source_event_id ?? null };
}

function band(
  target: number,
  tolerance: number,
  unit: BandUnit,
  origin: BandOrigin,
  floored: boolean,
): ResolvedBand {
  return {
    target,
    tolerance,
    lower: target - tolerance,
    upper: target + tolerance,
    unit,
    origin,
    floored,
  };
}

export function resolveFoodBand(
  setting: FoodBandSetting,
  plan: EnergyPlan,
  ctx: FoodContext,
): ResolvedBand | UncoveredBand {
  if ('preset' in setting) {
    const aim = foodPresetAim(plan, setting.preset, ctx);
    if ('uncovered' in aim) return aim;
    const origin: BandOrigin = {
      kind: 'food_preset',
      preset: setting.preset,
      stage: aim.stage,
      modelId: aim.modelId,
      sourceId: ENERGY_MODELS[aim.modelId].sourceId,
      pointTolerance: aim.pointTolerance,
    };
    return band(aim.target, aim.tolerance, 'kcal', origin, aim.floored);
  }
  const floor = foodFloorKcal(ctx.kg, usableTargetKg(ctx));
  const { target, floored } = lifted(setting.target, setting.tolerance, floor);
  return band(
    target,
    setting.tolerance,
    'kcal',
    customOrigin(setting),
    floored,
  );
}

/** A water notch in ml per kg a day, from the first model in the plan that gives it. */
export function waterPresetAim(
  plan: WaterPlan,
  preset: WaterPreset,
): { target: number; tolerance: number; modelId: WaterModelId } | null {
  for (const modelId of plan[preset] ?? []) {
    const aim = WATER_MODELS[modelId].aim(preset);
    if (aim) return { ...aim, modelId };
  }
  return null;
}

/** The day's water band in ml at her weight; null when no model gives the preset. */
export function resolveWaterBand(
  setting: WaterBandSetting,
  plan: WaterPlan,
  kg: number,
): ResolvedBand | null {
  const ml = (perKg: number) => roundTo(perKg * kg, INTAKE_GUARDS.mlStep);
  if ('preset' in setting) {
    const aim = waterPresetAim(plan, setting.preset);
    if (!aim) return null;
    const origin: BandOrigin = {
      kind: 'water_preset',
      preset: setting.preset,
      modelId: aim.modelId,
      sourceId: WATER_MODELS[aim.modelId].sourceId,
    };
    return band(ml(aim.target), ml(aim.tolerance), 'ml', origin, false);
  }
  return band(
    ml(setting.target),
    ml(setting.tolerance),
    'ml',
    customOrigin(setting),
    false,
  );
}

/** Seconds a day spent eating or drinking. No source gives these, so it is custom only. */
export function resolveDurationBand(setting: CustomBandSetting): ResolvedBand {
  return band(
    setting.target,
    setting.tolerance,
    's',
    customOrigin(setting),
    false,
  );
}
