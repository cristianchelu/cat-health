import { type Static, Type } from '@fastify/type-provider-typebox';

import {
  ENERGY_MODEL_IDS,
  FOOD_PRESETS,
  type EnergyModelId,
  type FoodPreset,
} from '../../nutrition/food.ts';
import {
  WATER_MODEL_IDS,
  WATER_PRESETS,
  type WaterModelId,
  type WaterPreset,
} from '../../nutrition/water.ts';

/** A schema accepting exactly `values`, typed as their union; the list stays owned by the nutrition module. */
function oneOf<Value extends string>(values: readonly Value[]) {
  return Type.Unsafe<Value>(
    Type.Union(values.map((value) => Type.Literal(value))),
  );
}

export const EnergyModelIdSchema = oneOf<EnergyModelId>(ENERGY_MODEL_IDS);
export const WaterModelIdSchema = oneOf<WaterModelId>(WATER_MODEL_IDS);
export const FoodPresetSchema = oneOf<FoodPreset>(FOOD_PRESETS);
export const WaterPresetSchema = oneOf<WaterPreset>(WATER_PRESETS);

/** The energy models to ask, most preferred first; the first with a row for her case answers. */
export const EnergyPlanSchema = Type.Array(EnergyModelIdSchema);
export type EnergyPlan = Static<typeof EnergyPlanSchema>;

/** The water models to ask, read the same way as `EnergyPlanSchema`. */
export const WaterPlanSchema = Type.Array(WaterModelIdSchema);
export type WaterPlan = Static<typeof WaterPlanSchema>;

/**
 * A band set off the notches, in the band's own unit: kcal a day for food,
 * ml per kg a day for water, seconds a day for duration. It may cite the vet
 * visit event the numbers came from.
 */
export const CustomBandSettingSchema = Type.Object({
  target: Type.Number({ minimum: 0 }),
  tolerance: Type.Number({ minimum: 0 }),
  source_event_id: Type.Optional(Type.Integer()),
});
export type CustomBandSetting = Static<typeof CustomBandSettingSchema>;

/** What is stored for the food band: the notch it sits on, or a custom band. */
export const FoodBandSettingSchema = Type.Union([
  Type.Object({ preset: FoodPresetSchema }),
  CustomBandSettingSchema,
]);
export type FoodBandSetting = Static<typeof FoodBandSettingSchema>;

/** What is stored for the water band: the notch it sits on, or a custom band. */
export const WaterBandSettingSchema = Type.Union([
  Type.Object({ preset: WaterPresetSchema }),
  CustomBandSettingSchema,
]);
export type WaterBandSetting = Static<typeof WaterBandSettingSchema>;
