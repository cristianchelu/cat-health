import {
  FOOD_PRESETS,
  WATER_PRESETS,
  aahaRer,
  answerWater,
  foodFloorKcal,
  intakePetOf,
  resolveFoodBand,
  type EnergyPlan,
  type FoodBandSetting,
  type FoodPreset,
  type GetDietaryNeedsResponse,
  type IntakePet,
  type PetAlteredDTO,
  type PutDietaryNeedsRequest,
  type WaterBandSetting,
  type WaterPlan,
  type WaterPreset,
} from 'shared';

/**
 * A band while it is being edited: target ± tolerance in the unit the page
 * shows, which is kcal a day for food and ml per kg a day for water.
 */
export interface BandDraft {
  target: number;
  tolerance: number;
}

/** A preset on a band's slider, and the band it stands for today. */
export interface Notch<Preset extends string> extends BandDraft {
  preset: Preset;
}

/** The range a band's slider covers, and how far one drag step moves. */
export interface BandScale {
  min: number;
  max: number;
  step: number;
}

/** What her bands depend on, as the page knows it. */
export interface NeedsProfile {
  /** `yyyy-MM-dd`, or null when unknown. */
  birthDate: string | null;
  altered: PetAlteredDTO;
  /** The weight her bands are worked out at. */
  weightKg: number;
  targetWeightKg: number | null;
  /** The calendar day her age is read on, `yyyy-MM-dd`. */
  today: string;
}

/** The cat as the shared models read her, from the page's profile. */
export function intakePetFor(profile: NeedsProfile): IntakePet {
  return intakePetOf(
    {
      birthDate: profile.birthDate,
      altered: profile.altered,
      kg: profile.weightKg,
      targetKg: profile.targetWeightKg,
    },
    profile.today,
  );
}

/** Every food preset that has a band for her today, in kcal a day, in slider order. */
export function foodNotches(
  plan: EnergyPlan,
  pet: IntakePet,
): Notch<FoodPreset>[] {
  const notches: Notch<FoodPreset>[] = [];
  for (const preset of FOOD_PRESETS) {
    const band = resolveFoodBand({ preset }, plan, pet);
    if ('gap' in band) continue;
    notches.push({ preset, target: band.target, tolerance: band.tolerance });
  }
  return byTarget(notches);
}

/**
 * Every water preset that has a band, in ml per kg a day, in slider order.
 * These are the source's own figures, to two decimals: her band in ml a day is
 * rounded to whole ml, so dividing it back by her weight would not give them.
 */
export function waterNotches(
  plan: WaterPlan,
  pet: IntakePet,
): Notch<WaterPreset>[] {
  const notches: Notch<WaterPreset>[] = [];
  for (const preset of WATER_PRESETS) {
    const answer = answerWater(plan, preset, pet);
    if ('gap' in answer) continue;
    const { low, high } = answer.mlPerDay;
    notches.push({
      preset,
      target: toHundredths((low + high) / 2 / pet.kg),
      tolerance: toHundredths((high - low) / 2 / pet.kg),
    });
  }
  return byTarget(notches);
}

function byTarget<Preset extends string>(
  notches: Notch<Preset>[],
): Notch<Preset>[] {
  return notches.sort((a, b) => a.target - b.target);
}

function toHundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Where a saved setting puts the draft: on its preset's notch, or at the
 * custom band as set. Null when the preset has no band today, which leaves
 * nothing to edit until it gets one.
 */
export function draftOf<Preset extends string>(
  setting: { preset: Preset } | BandDraft,
  notches: readonly Notch<Preset>[],
): BandDraft | null {
  if (!('preset' in setting)) {
    return { target: setting.target, tolerance: setting.tolerance };
  }
  const notch = notches.find((n) => n.preset === setting.preset);
  if (!notch) return null;
  return { target: notch.target, tolerance: notch.tolerance };
}

/** The preset a draft sits exactly on, target and tolerance both, or null between notches. */
export function presetAt<Preset extends string>(
  draft: BandDraft,
  notches: readonly Notch<Preset>[],
): Preset | null {
  const notch = notches.find(
    (n) => n.target === draft.target && n.tolerance === draft.tolerance,
  );
  return notch?.preset ?? null;
}

/**
 * What a draft saves as: its preset while it sits on a notch, so the band
 * keeps following her weight, and a custom band anywhere else.
 */
export function settingOf<Preset extends string>(
  draft: BandDraft,
  notches: readonly Notch<Preset>[],
): { preset: Preset } | BandDraft {
  const preset = presetAt(draft, notches);
  if (preset !== null) return { preset };
  return { target: draft.target, tolerance: draft.tolerance };
}

/** The food setting a draft saves as; see `settingOf`. */
export function foodSettingOf(
  draft: BandDraft,
  notches: readonly Notch<FoodPreset>[],
): FoodBandSetting {
  return settingOf(draft, notches);
}

/** The water setting a draft saves as; see `settingOf`. */
export function waterSettingOf(
  draft: BandDraft,
  notches: readonly Notch<WaterPreset>[],
): WaterBandSetting {
  return settingOf(draft, notches);
}

/** How far above her resting need the food slider reaches. */
const FOOD_SCALE_RER_FACTOR = 1.6;

/** The food slider: from the lowest kcal her band may reach to well above maintenance, in 5 kcal drags. */
export function foodScale(pet: IntakePet): BandScale {
  return {
    min: foodFloorKcal(pet),
    max: Math.round(FOOD_SCALE_RER_FACTOR * restingKcal(pet)),
    step: 5,
  };
}

/** The water slider, in ml per kg a day; every published range sits inside it. */
export const WATER_SCALE: BandScale = { min: 10, max: 70, step: 1 };

/** Her resting energy need at her current weight, in kcal a day. */
export function restingKcal(pet: IntakePet): number {
  return aahaRer(pet.kg);
}

/**
 * A draft moved to `target`, kept on the scale. The band never dips below
 * `floor`, so a target near it narrows the tolerance.
 */
export function withTarget(
  draft: BandDraft,
  target: number,
  scale: BandScale,
  floor: number,
): BandDraft {
  const clamped = Math.min(scale.max, Math.max(scale.min, target));
  return {
    target: clamped,
    tolerance: Math.min(draft.tolerance, clamped - floor),
  };
}

/**
 * A draft with a new tolerance. The band never dips below `floor`, so a
 * tolerance too wide for the target lifts the target.
 */
export function withTolerance(
  draft: BandDraft,
  tolerance: number,
  floor: number,
): BandDraft {
  const widened = Math.max(0, tolerance);
  return {
    target: Math.max(draft.target, floor + widened),
    tolerance: widened,
  };
}

/**
 * Everything the page edits before Save. Each band is kept as the setting it
 * would save as, so one sitting on a notch follows that notch when a target
 * weight being typed moves it.
 */
export interface NeedsDraft {
  foodTracked: boolean;
  food: FoodBandSetting;
  waterTracked: boolean;
  water: WaterBandSetting;
  /** The target weight field's text, in kg; empty for none. */
  targetWeight: string;
}

/** The draft a saved response starts from. */
export function draftFromNeeds(needs: GetDietaryNeedsResponse): NeedsDraft {
  return {
    foodTracked: needs.food.tracked,
    food: needs.food.setting,
    waterTracked: needs.water.tracked,
    water: needs.water.setting,
    targetWeight:
      needs.target_weight_kg === null ? '' : String(needs.target_weight_kg),
  };
}

/** The target weight a field's text stands for: a weight, none, or text that is not a weight. */
export function parseTargetWeight(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const kg = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(kg) || kg <= 0) return 'invalid';
  return kg;
}

/** What a draft asks the server to save. The field must already hold a weight or nothing. */
export function changeFromDraft(draft: NeedsDraft): PutDietaryNeedsRequest {
  const targetWeight = parseTargetWeight(draft.targetWeight);
  return {
    food: { tracked: draft.foodTracked, setting: draft.food },
    water: { tracked: draft.waterTracked, setting: draft.water },
    target_weight_kg: targetWeight === 'invalid' ? null : targetWeight,
  };
}
