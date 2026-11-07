import { type Static, Type } from '@fastify/type-provider-typebox';

import {
  ENERGY_GOALS,
  ENERGY_MODEL_IDS,
  type EnergyGoal,
  type EnergyModelId,
} from '../../nutrition/energyModels.ts';
import {
  WATER_MODEL_IDS,
  WATER_PRESETS,
  type WaterModelId,
  type WaterPreset,
} from '../../nutrition/waterModels.ts';

export const EnergyModelIdSchema = Type.Unsafe<EnergyModelId>(
  Type.Union(ENERGY_MODEL_IDS.map((id) => Type.Literal(id))),
);
export const WaterModelIdSchema = Type.Unsafe<WaterModelId>(
  Type.Union(WATER_MODEL_IDS.map((id) => Type.Literal(id))),
);
export const EnergyGoalSchema = Type.Unsafe<EnergyGoal>(
  Type.Union(ENERGY_GOALS.map((goal) => Type.Literal(goal))),
);
export const WaterPresetSchema = Type.Unsafe<WaterPreset>(
  Type.Union(WATER_PRESETS.map((preset) => Type.Literal(preset))),
);

const EnergyPlanRowSchema = Type.Object({
  maintain: Type.Optional(Type.Array(EnergyModelIdSchema)),
  lose: Type.Optional(Type.Array(EnergyModelIdSchema)),
});

/** For each stage and goal, the models to ask in order; the first that answers wins. */
export const EnergyPlanSchema = Type.Object({
  growth: EnergyPlanRowSchema,
  adult_neutered: EnergyPlanRowSchema,
  adult_intact: EnergyPlanRowSchema,
});
export type EnergyPlan = Static<typeof EnergyPlanSchema>;

export const WaterPlanSchema = Type.Object({
  normal: Type.Optional(Type.Array(WaterModelIdSchema)),
  uti_prone: Type.Optional(Type.Array(WaterModelIdSchema)),
});
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
  Type.Object({ preset: EnergyGoalSchema }),
  CustomBandSettingSchema,
]);
export type FoodBandSetting = Static<typeof FoodBandSettingSchema>;

export const WaterBandSettingSchema = Type.Union([
  Type.Object({ preset: WaterPresetSchema }),
  CustomBandSettingSchema,
]);
export type WaterBandSetting = Static<typeof WaterBandSettingSchema>;
