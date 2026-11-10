import {
  type Static,
  type TSchema,
  Type,
} from '@fastify/type-provider-typebox';

import { BAND_ADJUSTMENTS, INTAKE_GAPS } from '../../nutrition/band.ts';

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
import { literalUnion } from '../runtimeSchema.ts';

export const EnergyModelIdSchema =
  literalUnion<EnergyModelId>(ENERGY_MODEL_IDS);
export const WaterModelIdSchema = literalUnion<WaterModelId>(WATER_MODEL_IDS);
export const FoodPresetSchema = literalUnion<FoodPreset>(FOOD_PRESETS);
export const WaterPresetSchema = literalUnion<WaterPreset>(WATER_PRESETS);

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

/** A value that may be absent, sent as null. */
function nullable<Schema extends TSchema>(schema: Schema) {
  return Type.Union([schema, Type.Null()]);
}

const IntakeGapSchema = literalUnion(INTAKE_GAPS);

/**
 * A resolved band on the wire: the band's own numbers, its bounds spelled out
 * so no client derives them, and where the numbers came from.
 */
function resolvedBandSchema<Preset extends TSchema, ModelId extends TSchema>(
  unit: 'kcal' | 'ml',
  preset: Preset,
  modelId: ModelId,
) {
  return Type.Object({
    target: Type.Number(),
    tolerance: Type.Number(),
    lower: Type.Number(),
    upper: Type.Number(),
    unit: Type.Literal(unit),
    adjustments: Type.Array(literalUnion(BAND_ADJUSTMENTS)),
    origin: Type.Union([
      Type.Object({
        kind: Type.Literal('preset'),
        preset,
        model_id: modelId,
        ref: Type.String(),
      }),
      Type.Object({
        kind: Type.Literal('custom'),
        source_event_id: nullable(Type.Integer()),
      }),
    ]),
  });
}

/** What one notch gives her today: its band, or the reason it has none. */
function presetOutcomeSchema<Preset extends TSchema, Band extends TSchema>(
  preset: Preset,
  band: Band,
) {
  return Type.Object({
    preset,
    band: nullable(band),
    gap: nullable(IntakeGapSchema),
  });
}

const FoodBandSchema = resolvedBandSchema(
  'kcal',
  FoodPresetSchema,
  EnergyModelIdSchema,
);
const WaterBandSchema = resolvedBandSchema(
  'ml',
  WaterPresetSchema,
  WaterModelIdSchema,
);

/**
 * A pet's food and water bands as set, and as they resolve today. Everything
 * resolved is null while she has never been weighed.
 */
export const GetDietaryNeedsResponseSchema = Type.Object({
  /** The weight her bands are worked out at, or null when she has never been weighed. */
  weight_kg: nullable(Type.Number()),
  target_weight_kg: nullable(Type.Number()),
  food: Type.Object({
    tracked: Type.Boolean(),
    setting: FoodBandSettingSchema,
    plan: EnergyPlanSchema,
    band: nullable(FoodBandSchema),
    gap: nullable(IntakeGapSchema),
    /** Every notch, in slider order. */
    presets: Type.Array(presetOutcomeSchema(FoodPresetSchema, FoodBandSchema)),
    /** The lowest kcal a day her food band may reach. */
    floor_kcal: nullable(Type.Number()),
    /** Her resting energy need, which the page shows her band against. */
    resting_kcal: nullable(Type.Number()),
  }),
  water: Type.Object({
    tracked: Type.Boolean(),
    setting: WaterBandSettingSchema,
    plan: WaterPlanSchema,
    band: nullable(WaterBandSchema),
    gap: nullable(IntakeGapSchema),
    /** Every notch, in slider order. */
    presets: Type.Array(
      presetOutcomeSchema(WaterPresetSchema, WaterBandSchema),
    ),
  }),
});
export type GetDietaryNeedsResponse = Static<
  typeof GetDietaryNeedsResponseSchema
>;

/**
 * The parts of a pet's dietary needs to change; anything left out stays as it
 * is. A null `target_weight_kg` clears the target weight.
 */
export const PutDietaryNeedsRequestSchema = Type.Object({
  food: Type.Optional(
    Type.Object({ tracked: Type.Boolean(), setting: FoodBandSettingSchema }),
  ),
  water: Type.Optional(
    Type.Object({ tracked: Type.Boolean(), setting: WaterBandSettingSchema }),
  ),
  target_weight_kg: Type.Optional(
    nullable(Type.Number({ exclusiveMinimum: 0 })),
  ),
});
export type PutDietaryNeedsRequest = Static<
  typeof PutDietaryNeedsRequestSchema
>;

/** The path of a pet's dietary needs. */
export const DietaryNeedsParamsSchema = Type.Object({ id: Type.Number() });

/** The zone "today" is read in; UTC when left out. */
export const DietaryNeedsQuerySchema = Type.Object({
  timezone: Type.Optional(Type.String()),
});
