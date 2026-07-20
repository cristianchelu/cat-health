import { Type, type Static } from "@fastify/type-provider-typebox";
import { parseWithSchema } from "../runtimeSchema.ts";

export const EventTypeSchema = Type.Union([
  Type.Literal("weight_measurement"),
  Type.Literal("water_intake"),
  Type.Literal("litterbox_use"),
  Type.Literal("food_intake"),
  Type.Literal("litterbox_maintenance"),
  Type.Literal("device_connectivity"),
  Type.Literal("pet_presence"),
]);
export type EventType = Static<typeof EventTypeSchema>;

export const LitterboxUseEliminationTypeSchema = Type.Union([
  Type.Literal("urination"),
  Type.Literal("defecation"),
  Type.Literal("both"),
  Type.Literal("no_elimination"),
  Type.Literal("unknown"),
]);
export type LitterboxUseEliminationType = Static<
  typeof LitterboxUseEliminationTypeSchema
>;

export function parseLitterboxUseEliminationType(
  raw: unknown,
): LitterboxUseEliminationType | null {
  return parseWithSchema(LitterboxUseEliminationTypeSchema, raw) ?? null;
}

export const LitterboxAnalysisStatePeriodSchema = Type.Object({
  state: Type.String(),
  start: Type.Number(),
  end: Type.Number(),
  elimination_type: Type.Optional(
    Type.Union([Type.Literal("urination"), Type.Literal("defecation")]),
  ),
});
export type LitterboxAnalysisStatePeriodDTO = Static<
  typeof LitterboxAnalysisStatePeriodSchema
>;

export const LitterboxBoutAnnotationSchema = Type.Object({
  bout_index: Type.Number(),
  t_start_s: Type.Number(),
  t_end_s: Type.Number(),
  bout_type: Type.Union([
    Type.Literal("urination"),
    Type.Literal("defecation"),
    Type.Literal("unknown"),
  ]),
});
export type LitterboxBoutAnnotationDTO = Static<
  typeof LitterboxBoutAnnotationSchema
>;

export const LitterboxAnnotationSchema = Type.Object({
  bouts: Type.Array(LitterboxBoutAnnotationSchema),
  excluded: Type.Optional(Type.Boolean()),
});
export type LitterboxAnnotationDTO = Static<typeof LitterboxAnnotationSchema>;

export const WeightMeasurementEventDataSchema = Type.Object({
  type: Type.Literal("weight_measurement"),
  weight: Type.Number(),
});
export type WeightMeasurementEventDataDTO = Static<
  typeof WeightMeasurementEventDataSchema
>;

export const WaterIntakeEventDataSchema = Type.Object({
  type: Type.Literal("water_intake"),
  amount: Type.Number(),
  duration: Type.Optional(Type.Number()),
  source: Type.Optional(
    Type.Union([Type.Literal("drinking"), Type.Literal("food")]),
  ),
  raw_amount: Type.Optional(Type.Number()),
  excluded_amount: Type.Optional(Type.Number()),
  filtered: Type.Optional(Type.Boolean()),
});
export type WaterIntakeEventDataDTO = Static<typeof WaterIntakeEventDataSchema>;

export const LitterboxUseEventDataSchema = Type.Object({
  type: Type.Literal("litterbox_use"),
  elimination_type: LitterboxUseEliminationTypeSchema,
  elimination_weight: Type.Number(),
  duration: Type.Number(),
  straining: Type.Optional(Type.Boolean()),
  annotation: Type.Optional(LitterboxAnnotationSchema),
  segments: Type.Optional(
    Type.Union([Type.Array(LitterboxAnalysisStatePeriodSchema), Type.Null()]),
  ),
});
export type LitterboxUseEventDataDTO = Static<
  typeof LitterboxUseEventDataSchema
>;

export const FoodIntakeFoodTypeSchema = Type.Union([
  Type.Literal("dry"),
  Type.Literal("wet"),
  Type.Literal("treat"),
  Type.Literal("unknown"),
]);
export type FoodIntakeFoodTypeDTO = Static<typeof FoodIntakeFoodTypeSchema>;

export const FoodIntakeNutrientsSchema = Type.Record(
  Type.String(),
  Type.Number(),
);
export type FoodIntakeNutrientsDTO = Static<typeof FoodIntakeNutrientsSchema>;

/** Provider-specific metadata on events (discriminated by `provider`). */
export const SurePetEventProviderDataSchema = Type.Object({
  provider: Type.Literal("surepet"),
  external_key: Type.String(),
  tag_id: Type.Optional(Type.Number()),
  /** SurePet cloud device id */
  device_id: Type.Optional(Type.Number()),
  /** SurePet cloud pet id */
  pet_id: Type.Optional(Type.Number()),
  duration_s: Type.Optional(Type.Number()),
  timeline_entry_id: Type.Optional(Type.Number()),
  /** SurePet hardware bowl index (0 | 1); not a compartment id. */
  bowl_index: Type.Optional(Type.Number()),
});
export type SurePetEventProviderData = Static<
  typeof SurePetEventProviderDataSchema
>;

export const EventProviderDataSchema = Type.Union([
  SurePetEventProviderDataSchema,
]);
export type EventProviderData = Static<typeof EventProviderDataSchema>;

export const FoodIntakeEventDataSchema = Type.Object({
  type: Type.Literal("food_intake"),
  food_type: FoodIntakeFoodTypeSchema,
  amount: Type.Number(),
  food_id: Type.Optional(Type.Number()),
  provider_data: Type.Optional(EventProviderDataSchema),
  nutrients: Type.Optional(FoodIntakeNutrientsSchema),
});
export type FoodIntakeEventDataDTO = Static<typeof FoodIntakeEventDataSchema>;

export const LitterboxMaintenanceEventTypeSchema = Type.Union([
  Type.Literal("scoop"),
  Type.Literal("deep_clean"),
  Type.Literal("litter_change"),
  Type.Literal("litter_addition"),
]);
export type LitterboxMaintenanceEventTypeDTO = Static<
  typeof LitterboxMaintenanceEventTypeSchema
>;

export const LitterboxMaintenanceEventDataSchema = Type.Object({
  type: Type.Literal("litterbox_maintenance"),
  maintenance_type: LitterboxMaintenanceEventTypeSchema,
  litter_amount: Type.Optional(Type.Number()),
});
export type LitterboxMaintenanceEventDataDTO = Static<
  typeof LitterboxMaintenanceEventDataSchema
>;

export const DeviceConnectivityStateSchema = Type.Union([
  Type.Literal("online"),
  Type.Literal("offline"),
  Type.Literal("error"),
]);
export type DeviceConnectivityStateDTO = Static<
  typeof DeviceConnectivityStateSchema
>;

export const DeviceConnectivityPreviousStateSchema = Type.Union([
  DeviceConnectivityStateSchema,
  Type.Literal("unknown"),
]);
export type DeviceConnectivityPreviousStateDTO = Static<
  typeof DeviceConnectivityPreviousStateSchema
>;

export const DeviceConnectivityEventDataSchema = Type.Object({
  type: Type.Literal("device_connectivity"),
  state: DeviceConnectivityStateSchema,
  previous_state: Type.Optional(DeviceConnectivityPreviousStateSchema),
});
export type DeviceConnectivityEventDataDTO = Static<
  typeof DeviceConnectivityEventDataSchema
>;

export const PetPresenceStateSchema = Type.Union([
  Type.Literal("away"),
  Type.Literal("home"),
  Type.Literal("outside"),
]);
export type PetPresenceStateDTO = Static<typeof PetPresenceStateSchema>;

export const PetPresenceContextSchema = Type.Union([
  Type.Literal("vet"),
  Type.Literal("travel"),
  Type.Literal("friend"),
  Type.Literal("manual"),
]);
export type PetPresenceContextDTO = Static<typeof PetPresenceContextSchema>;

export const PetPresencePreviousStateSchema = Type.Union([
  PetPresenceStateSchema,
  Type.Literal("unknown"),
]);
export type PetPresencePreviousStateDTO = Static<
  typeof PetPresencePreviousStateSchema
>;

export const PetPresenceEventDataSchema = Type.Object({
  type: Type.Literal("pet_presence"),
  state: PetPresenceStateSchema,
  context: Type.Optional(PetPresenceContextSchema),
  previous_state: Type.Optional(PetPresencePreviousStateSchema),
});
export type PetPresenceEventDataDTO = Static<typeof PetPresenceEventDataSchema>;

export const EventDataSchema = Type.Union([
  WeightMeasurementEventDataSchema,
  WaterIntakeEventDataSchema,
  LitterboxUseEventDataSchema,
  FoodIntakeEventDataSchema,
  LitterboxMaintenanceEventDataSchema,
  DeviceConnectivityEventDataSchema,
  PetPresenceEventDataSchema,
]);
export type EventDataDTO = Static<typeof EventDataSchema>;

