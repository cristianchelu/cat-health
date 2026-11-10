import { type Static, Type } from '@fastify/type-provider-typebox';

import {
  FOOD_PRESETS,
  ENERGY_MODEL_IDS,
  type FoodPreset,
  type EnergyModelId,
} from '../../nutrition/food.ts';
import {
  WATER_MODEL_IDS,
  WATER_PRESETS,
  type WaterModelId,
  type WaterPreset,
} from '../../nutrition/water.ts';

export const EnergyModelIdSchema = Type.Unsafe<EnergyModelId>(
  Type.Union(ENERGY_MODEL_IDS.map((id) => Type.Literal(id))),
);
export const WaterModelIdSchema = Type.Unsafe<WaterModelId>(
  Type.Union(WATER_MODEL_IDS.map((id) => Type.Literal(id))),
);
export const FoodPresetSchema = Type.Unsafe<FoodPreset>(
  Type.Union(FOOD_PRESETS.map((preset) => Type.Literal(preset))),
);
export const WaterPresetSchema = Type.Unsafe<WaterPreset>(
  Type.Union(WATER_PRESETS.map((preset) => Type.Literal(preset))),
);

/** The models to ask, most preferred first; the first with a row for her case answers. */
export const EnergyPlanSchema = Type.Array(EnergyModelIdSchema);
export type EnergyPlan = Static<typeof EnergyPlanSchema>;

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

export const FoodBandSettingSchema = Type.Union([
  Type.Object({ preset: FoodPresetSchema }),
  CustomBandSettingSchema,
]);
export type FoodBandSetting = Static<typeof FoodBandSettingSchema>;

export const WaterBandSettingSchema = Type.Union([
  Type.Object({ preset: WaterPresetSchema }),
  CustomBandSettingSchema,
]);
export type WaterBandSetting = Static<typeof WaterBandSettingSchema>;
