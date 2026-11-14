import { type Static, Type } from '@fastify/type-provider-typebox';
import {
  ENERGY_MODEL_IDS,
  FOOD_PRESETS,
  WATER_MODEL_IDS,
  WATER_PRESETS,
  literalUnion,
  parseWithSchema,
} from 'shared';

/**
 * Persistence-owned contract for the event `data` JSON column, and the owner
 * of the domain payload types in `domain/events.ts`, which are its `Static`.
 *
 * Deliberately declared here rather than reusing the wire schemas in `shared`:
 * stored rows are a historical archive that only changes via migration, while
 * the DTOs track the current API. `routes/mappers/events.ts` is the seam
 * between the two.
 */

const StoredSurePetProviderDataSchema = Type.Object({
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
  weight_context: Type.Optional(Type.Number()),
});

const StoredEventProviderDataSchema = Type.Union([
  StoredSurePetProviderDataSchema,
]);

export const StoredWeightMeasurementSchema = Type.Object({
  type: Type.Literal('weight_measurement'),
  weight: Type.Number(),
});

export const StoredWaterIntakeSchema = Type.Object({
  type: Type.Literal('water_intake'),
  amount: Type.Number(),
  duration: Type.Optional(Type.Number()),
  source: Type.Optional(
    Type.Union([Type.Literal('drinking'), Type.Literal('food')]),
  ),
  /** Total weight drop before rate filtering, in ml. */
  raw_amount: Type.Optional(Type.Number()),
  /** Amount the rate filter removed as spill or play, in ml. */
  excluded_amount: Type.Optional(Type.Number()),
  /** True when any segments were excluded. */
  filtered: Type.Optional(Type.Boolean()),
});

export const StoredLitterboxBoutAnnotationSchema = Type.Object({
  bout_index: Type.Number(),
  t_start_s: Type.Number(),
  t_end_s: Type.Number(),
  bout_type: Type.Union([
    Type.Literal('urination'),
    Type.Literal('defecation'),
    Type.Literal('unknown'),
  ]),
});

export const StoredLitterboxAnnotationSchema = Type.Object({
  bouts: Type.Array(StoredLitterboxBoutAnnotationSchema),
  /** When true, omit from human-verified export / training fixtures (bad data). */
  excluded: Type.Optional(Type.Boolean()),
});

const StoredLitterboxAnalysisStatePeriodSchema = Type.Object({
  state: Type.String(),
  start: Type.Number(),
  end: Type.Number(),
  elimination_type: Type.Optional(
    Type.Union([Type.Literal('urination'), Type.Literal('defecation')]),
  ),
});

const StoredEliminationTypeSchema = Type.Union([
  Type.Literal('urination'),
  Type.Literal('defecation'),
  Type.Literal('both'),
  Type.Literal('no_elimination'),
  Type.Literal('unknown'),
]);

export const StoredLitterboxUseSchema = Type.Object({
  type: Type.Literal('litterbox_use'),
  elimination_type: StoredEliminationTypeSchema,
  elimination_weight: Type.Number(),
  duration: Type.Number(),
  /**
   * True samples-per-second of this visit's raw_data weight trace; converts
   * `segments` sample indices to seconds. Derived from v2 per-sample offsets
   * (or count/duration for v1); absent on rows predating the backfill.
   */
  sample_rate_hz: Type.Optional(Type.Number()),
  straining: Type.Optional(Type.Boolean()),
  annotation: Type.Optional(StoredLitterboxAnnotationSchema),
  /**
   * Full server `StateAnalyzer` period list (sample indices). `null` = not analyzed / cleared;
   * `[]` = analyzed, zero periods. Per-row `elimination_type` (urination/defecation) is set on ingest/analyze.
   */
  segments: Type.Optional(
    Type.Union([
      Type.Array(StoredLitterboxAnalysisStatePeriodSchema),
      Type.Null(),
    ]),
  ),
  device_verdict: Type.Optional(
    Type.Object({
      visit_id: Type.Number(),
      elimination_type: StoredEliminationTypeSchema,
      cat_index: Type.Number(),
      cat_weight: Type.Number(),
      waste_weight: Type.Number(),
      segments: Type.Array(StoredLitterboxAnalysisStatePeriodSchema),
      firmware: Type.String(),
    }),
  ),
});

const StoredFoodTypeSchema = Type.Union([
  Type.Literal('dry'),
  Type.Literal('wet'),
  Type.Literal('treat'),
  Type.Literal('unknown'),
]);

export const StoredFoodIntakeSchema = Type.Object({
  type: Type.Literal('food_intake'),
  food_type: StoredFoodTypeSchema,
  amount: Type.Number(),
  food_id: Type.Optional(Type.Number()),
  provider_data: Type.Optional(StoredEventProviderDataSchema),
  /**
   * Computed nutrient totals for the intake, keyed by nutrient. Known keys:
   * `calories`, `moisture_ml`, `protein_g`, `fat_g`, `fiber_g`, `ash_g`,
   * `carbs_g`, `calcium_mg`, `phosphorus_mg`, `taurine_mg`, `sodium_mg`,
   * `omega3_g`, `omega6_g`.
   */
  nutrients: Type.Optional(Type.Record(Type.String(), Type.Number())),
});

export const StoredFoodServedSchema = Type.Object({
  type: Type.Literal('food_served'),
  food_type: StoredFoodTypeSchema,
  /** Grams added to the bowl by this serving. */
  amount: Type.Number(),
  food_id: Type.Optional(Type.Number()),
  /** Bowl level in grams immediately before the serving, when weighed. */
  level_before: Type.Optional(Type.Number()),
  /** Bowl level in grams immediately after the serving, when weighed. */
  level_after: Type.Optional(Type.Number()),
  provider_data: Type.Optional(StoredEventProviderDataSchema),
});

export const StoredLitterboxMaintenanceSchema = Type.Object({
  type: Type.Literal('litterbox_maintenance'),
  maintenance_type: Type.Union([
    Type.Literal('scoop'),
    Type.Literal('deep_clean'),
    Type.Literal('litter_change'),
    Type.Literal('litter_addition'),
  ]),
  /** In grams, for `litter_change` and `litter_addition`. */
  litter_amount: Type.Optional(Type.Number()),
});

export const StoredDeviceConnectivityStateSchema = Type.Union([
  Type.Literal('online'),
  Type.Literal('offline'),
  Type.Literal('error'),
]);

export const StoredDeviceConnectivityPreviousStateSchema = Type.Union([
  StoredDeviceConnectivityStateSchema,
  Type.Literal('unknown'),
]);

export const StoredDeviceStatusCauseSchema = Type.Union([
  Type.Literal('device'),
  Type.Literal('account'),
]);

export const StoredDeviceConnectivitySchema = Type.Object({
  type: Type.Literal('device_connectivity'),
  state: StoredDeviceConnectivityStateSchema,
  previous_state: Type.Optional(StoredDeviceConnectivityPreviousStateSchema),
  /** `account` when the device went with its account's connection. */
  cause: Type.Optional(StoredDeviceStatusCauseSchema),
});

export const StoredDeviceEnablementSchema = Type.Object({
  type: Type.Literal('device_enablement'),
  enabled: Type.Boolean(),
  /** Which switch moved: the device's own, or its whole account's. */
  cause: Type.Optional(StoredDeviceStatusCauseSchema),
});

export const StoredPetPresenceStateSchema = Type.Union([
  Type.Literal('away'),
  Type.Literal('home'),
  Type.Literal('outside'),
]);

export const StoredPetPresenceContextSchema = Type.Union([
  Type.Literal('vet'),
  Type.Literal('travel'),
  Type.Literal('friend'),
  Type.Literal('manual'),
  Type.Literal('profile_closed'),
  Type.Literal('profile_reopened'),
]);

export const StoredPetPresencePreviousStateSchema = Type.Union([
  StoredPetPresenceStateSchema,
  Type.Literal('unknown'),
]);

export const StoredPetPresenceSchema = Type.Object({
  type: Type.Literal('pet_presence'),
  state: StoredPetPresenceStateSchema,
  context: Type.Optional(StoredPetPresenceContextSchema),
  previous_state: Type.Optional(StoredPetPresencePreviousStateSchema),
});

const StoredCustomBandSettingSchema = Type.Object({
  target: Type.Number(),
  tolerance: Type.Number(),
  source_event_id: Type.Optional(Type.Integer()),
});

/** Model and preset ids are append-only in `shared`, so every id a row can hold is still in these lists. */
export const StoredFoodIntakeTargetSchema = Type.Object({
  type: Type.Literal('intake_target'),
  kind: Type.Literal('food'),
  measure: Type.Literal('amount'),
  tracked: Type.Boolean(),
  plan: Type.Array(literalUnion(ENERGY_MODEL_IDS)),
  setting: Type.Union([
    Type.Object({ preset: literalUnion(FOOD_PRESETS) }),
    StoredCustomBandSettingSchema,
  ]),
});

export const StoredWaterIntakeTargetSchema = Type.Object({
  type: Type.Literal('intake_target'),
  kind: Type.Literal('water'),
  measure: Type.Literal('amount'),
  tracked: Type.Boolean(),
  plan: Type.Array(literalUnion(WATER_MODEL_IDS)),
  setting: Type.Union([
    Type.Object({ preset: literalUnion(WATER_PRESETS) }),
    StoredCustomBandSettingSchema,
  ]),
});

export const StoredWeightTargetSchema = Type.Object({
  type: Type.Literal('weight_target'),
  target_g: Type.Union([Type.Number(), Type.Null()]),
});

export const StoredEventDataSchema = Type.Union([
  StoredWeightMeasurementSchema,
  StoredWaterIntakeSchema,
  StoredLitterboxUseSchema,
  StoredFoodIntakeSchema,
  StoredFoodServedSchema,
  StoredLitterboxMaintenanceSchema,
  StoredDeviceConnectivitySchema,
  StoredDeviceEnablementSchema,
  StoredPetPresenceSchema,
  StoredFoodIntakeTargetSchema,
  StoredWaterIntakeTargetSchema,
  StoredWeightTargetSchema,
]);

/**
 * Corruption canary for the event `data` JSON blob: rejects out-of-band
 * garbage; does not coerce or normalize legitimate shape drift.
 */
export function parseStoredEventData(
  value: unknown,
): Static<typeof StoredEventDataSchema> | null {
  return parseWithSchema(StoredEventDataSchema, value) ?? null;
}
