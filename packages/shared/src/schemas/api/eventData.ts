import { Type, type Static } from '@fastify/type-provider-typebox';
import { parseWithSchema } from '../runtimeSchema.ts';

export const EventTypeSchema = Type.Union([
  Type.Literal('weight_measurement'),
  Type.Literal('water_intake'),
  Type.Literal('litterbox_use'),
  Type.Literal('food_intake'),
  Type.Literal('food_served'),
  Type.Literal('litterbox_maintenance'),
  Type.Literal('device_connectivity'),
  Type.Literal('device_enablement'),
  Type.Literal('pet_presence'),
]);
export type EventType = Static<typeof EventTypeSchema>;

export const LitterboxUseEliminationTypeSchema = Type.Union([
  Type.Literal('urination'),
  Type.Literal('defecation'),
  Type.Literal('both'),
  Type.Literal('no_elimination'),
  Type.Literal('unknown'),
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
    Type.Union([Type.Literal('urination'), Type.Literal('defecation')]),
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
    Type.Literal('urination'),
    Type.Literal('defecation'),
    Type.Literal('unknown'),
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
  type: Type.Literal('weight_measurement'),
  weight: Type.Number(),
});
export type WeightMeasurementEventDataDTO = Static<
  typeof WeightMeasurementEventDataSchema
>;

export const WaterIntakeEventDataSchema = Type.Object({
  type: Type.Literal('water_intake'),
  amount: Type.Number(),
  duration: Type.Optional(Type.Number()),
  source: Type.Optional(
    Type.Union([Type.Literal('drinking'), Type.Literal('food')]),
  ),
  raw_amount: Type.Optional(Type.Number()),
  excluded_amount: Type.Optional(Type.Number()),
  filtered: Type.Optional(Type.Boolean()),
});
export type WaterIntakeEventDataDTO = Static<typeof WaterIntakeEventDataSchema>;

/**
 * The verdict the litterbox firmware reached on its own, kept beside the
 * server's so the two can be diffed per visit. Present only on visits that
 * arrived as a device record (raw_data v3).
 */
export const LitterboxDeviceVerdictSchema = Type.Object({
  /** The device's event start, epoch seconds on its clock. */
  visit_id: Type.Number(),
  elimination_type: LitterboxUseEliminationTypeSchema,
  /** Slot in the device's cat weight table; -1 when it matched none. */
  cat_index: Type.Number(),
  cat_weight: Type.Number(),
  waste_weight: Type.Number(),
  segments: Type.Array(LitterboxAnalysisStatePeriodSchema),
  firmware: Type.String(),
});
export type LitterboxDeviceVerdictDTO = Static<
  typeof LitterboxDeviceVerdictSchema
>;

export const LitterboxUseEventDataSchema = Type.Object({
  type: Type.Literal('litterbox_use'),
  elimination_type: LitterboxUseEliminationTypeSchema,
  elimination_weight: Type.Number(),
  duration: Type.Number(),
  sample_rate_hz: Type.Optional(Type.Number()),
  straining: Type.Optional(Type.Boolean()),
  annotation: Type.Optional(LitterboxAnnotationSchema),
  segments: Type.Optional(
    Type.Union([Type.Array(LitterboxAnalysisStatePeriodSchema), Type.Null()]),
  ),
  device_verdict: Type.Optional(LitterboxDeviceVerdictSchema),
});
export type LitterboxUseEventDataDTO = Static<
  typeof LitterboxUseEventDataSchema
>;

export const FoodIntakeFoodTypeSchema = Type.Union([
  Type.Literal('dry'),
  Type.Literal('wet'),
  Type.Literal('treat'),
  Type.Literal('unknown'),
]);
export type FoodIntakeFoodTypeDTO = Static<typeof FoodIntakeFoodTypeSchema>;

export const FoodIntakeNutrientsSchema = Type.Record(
  Type.String(),
  Type.Number(),
);
export type FoodIntakeNutrientsDTO = Static<typeof FoodIntakeNutrientsSchema>;

/** Provider-specific metadata on events (discriminated by `provider`). */
export const SurePetEventProviderDataSchema = Type.Object({
  provider: Type.Literal('surepet'),
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
  /**
   * The weight record's `WeightContext`. Kept so a later pass can tell a chip
   * read (`PET_CLOSED`) from an intruder or a dubious reading that happens to
   * carry a tag id — only the first may ever be resolved to a pet.
   */
  weight_context: Type.Optional(Type.Number()),
});
export type SurePetEventProviderData = Static<
  typeof SurePetEventProviderDataSchema
>;

export const EventProviderDataSchema = Type.Union([
  SurePetEventProviderDataSchema,
]);
export type EventProviderData = Static<typeof EventProviderDataSchema>;

export const FoodIntakeEventDataSchema = Type.Object({
  type: Type.Literal('food_intake'),
  food_type: FoodIntakeFoodTypeSchema,
  amount: Type.Number(),
  food_id: Type.Optional(Type.Number()),
  provider_data: Type.Optional(EventProviderDataSchema),
  nutrients: Type.Optional(FoodIntakeNutrientsSchema),
});
export type FoodIntakeEventDataDTO = Static<typeof FoodIntakeEventDataSchema>;

/**
 * Food put into a bowl, as opposed to food taken out of one.
 *
 * Named for the property that separates it from stocking a hopper: after this
 * event the food is in front of the animal. A machine dispensing on a schedule
 * and a person tipping in a scoop are the same event here — `caused_by` says
 * which, so the type never has to.
 *
 * `amount` is what went in, never the bowl's level. `level_before` and
 * `level_after` carry the level when the device weighs its bowl, which is what
 * makes "topped up onto leftovers" (`level_before > 0`) a reading rather than a
 * second event type. Both absent on feeders that cannot weigh.
 */
export const FoodServedEventDataSchema = Type.Object({
  type: Type.Literal('food_served'),
  food_type: FoodIntakeFoodTypeSchema,
  /** Grams added to the bowl by this serving. */
  amount: Type.Number(),
  food_id: Type.Optional(Type.Number()),
  /** Bowl level in grams immediately before the serving, when weighed. */
  level_before: Type.Optional(Type.Number()),
  /** Bowl level in grams immediately after the serving, when weighed. */
  level_after: Type.Optional(Type.Number()),
  provider_data: Type.Optional(EventProviderDataSchema),
});
export type FoodServedEventDataDTO = Static<typeof FoodServedEventDataSchema>;

export const LitterboxMaintenanceEventTypeSchema = Type.Union([
  Type.Literal('scoop'),
  Type.Literal('deep_clean'),
  Type.Literal('litter_change'),
  Type.Literal('litter_addition'),
]);
export type LitterboxMaintenanceEventTypeDTO = Static<
  typeof LitterboxMaintenanceEventTypeSchema
>;

export const LitterboxMaintenanceEventDataSchema = Type.Object({
  type: Type.Literal('litterbox_maintenance'),
  maintenance_type: LitterboxMaintenanceEventTypeSchema,
  litter_amount: Type.Optional(Type.Number()),
});
export type LitterboxMaintenanceEventDataDTO = Static<
  typeof LitterboxMaintenanceEventDataSchema
>;

export const DeviceConnectivityStateSchema = Type.Union([
  Type.Literal('online'),
  Type.Literal('offline'),
  Type.Literal('error'),
]);
export type DeviceConnectivityStateDTO = Static<
  typeof DeviceConnectivityStateSchema
>;

export const DeviceConnectivityPreviousStateSchema = Type.Union([
  DeviceConnectivityStateSchema,
  Type.Literal('unknown'),
]);
export type DeviceConnectivityPreviousStateDTO = Static<
  typeof DeviceConnectivityPreviousStateSchema
>;

export const DeviceConnectivityEventDataSchema = Type.Object({
  type: Type.Literal('device_connectivity'),
  state: DeviceConnectivityStateSchema,
  previous_state: Type.Optional(DeviceConnectivityPreviousStateSchema),
});
export type DeviceConnectivityEventDataDTO = Static<
  typeof DeviceConnectivityEventDataSchema
>;

/**
 * The user's own switch, as opposed to what the device reported: a disabled
 * device leaves the household from this moment and an enabled one rejoins it.
 */
export const DeviceEnablementCauseSchema = Type.Union([
  Type.Literal('device'),
  Type.Literal('account'),
]);
export type DeviceEnablementCauseDTO = Static<
  typeof DeviceEnablementCauseSchema
>;

export const DeviceEnablementEventDataSchema = Type.Object({
  type: Type.Literal('device_enablement'),
  enabled: Type.Boolean(),
  /** Which switch moved: the device's own, or its whole account's. */
  cause: Type.Optional(DeviceEnablementCauseSchema),
});
export type DeviceEnablementEventDataDTO = Static<
  typeof DeviceEnablementEventDataSchema
>;

export const PetPresenceStateSchema = Type.Union([
  Type.Literal('away'),
  Type.Literal('home'),
  Type.Literal('outside'),
]);
export type PetPresenceStateDTO = Static<typeof PetPresenceStateSchema>;

export const PetPresenceContextSchema = Type.Union([
  Type.Literal('vet'),
  Type.Literal('travel'),
  Type.Literal('friend'),
  Type.Literal('manual'),
]);
export type PetPresenceContextDTO = Static<typeof PetPresenceContextSchema>;

export const PetPresencePreviousStateSchema = Type.Union([
  PetPresenceStateSchema,
  Type.Literal('unknown'),
]);
export type PetPresencePreviousStateDTO = Static<
  typeof PetPresencePreviousStateSchema
>;

export const PetPresenceEventDataSchema = Type.Object({
  type: Type.Literal('pet_presence'),
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
  FoodServedEventDataSchema,
  LitterboxMaintenanceEventDataSchema,
  DeviceConnectivityEventDataSchema,
  DeviceEnablementEventDataSchema,
  PetPresenceEventDataSchema,
]);
export type EventDataDTO = Static<typeof EventDataSchema>;
