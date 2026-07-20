import { Type } from '@fastify/type-provider-typebox';
import { parseWithSchema } from 'shared';

import type { EventData } from '../../domain/events.ts';

/**
 * Persistence-owned contract for the event `data` JSON column.
 *
 * Deliberately declared here rather than reusing the wire schemas in `shared`:
 * stored rows are a historical archive that only changes via migration, while
 * the DTOs track the current API. The two start out identical; when they
 * diverge, this file keeps describing what is actually in the database.
 *
 * `parseStoredEventData` returns domain `EventData` through a checked
 * assignment (no cast) — if this schema and the domain types drift apart,
 * it stops compiling.
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
});

const StoredEventProviderDataSchema = Type.Union([
  StoredSurePetProviderDataSchema,
]);

const StoredWeightMeasurementSchema = Type.Object({
  type: Type.Literal('weight_measurement'),
  weight: Type.Number(),
});

const StoredWaterIntakeSchema = Type.Object({
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

const StoredLitterboxBoutAnnotationSchema = Type.Object({
  bout_index: Type.Number(),
  t_start_s: Type.Number(),
  t_end_s: Type.Number(),
  bout_type: Type.Union([
    Type.Literal('urination'),
    Type.Literal('defecation'),
    Type.Literal('unknown'),
  ]),
});

const StoredLitterboxAnnotationSchema = Type.Object({
  bouts: Type.Array(StoredLitterboxBoutAnnotationSchema),
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

const StoredLitterboxUseSchema = Type.Object({
  type: Type.Literal('litterbox_use'),
  elimination_type: Type.Union([
    Type.Literal('urination'),
    Type.Literal('defecation'),
    Type.Literal('both'),
    Type.Literal('no_elimination'),
    Type.Literal('unknown'),
  ]),
  elimination_weight: Type.Number(),
  duration: Type.Number(),
  straining: Type.Optional(Type.Boolean()),
  annotation: Type.Optional(StoredLitterboxAnnotationSchema),
  segments: Type.Optional(
    Type.Union([
      Type.Array(StoredLitterboxAnalysisStatePeriodSchema),
      Type.Null(),
    ]),
  ),
});

const StoredFoodIntakeSchema = Type.Object({
  type: Type.Literal('food_intake'),
  food_type: Type.Union([
    Type.Literal('dry'),
    Type.Literal('wet'),
    Type.Literal('treat'),
    Type.Literal('unknown'),
  ]),
  amount: Type.Number(),
  food_id: Type.Optional(Type.Number()),
  provider_data: Type.Optional(StoredEventProviderDataSchema),
  nutrients: Type.Optional(Type.Record(Type.String(), Type.Number())),
});

const StoredLitterboxMaintenanceSchema = Type.Object({
  type: Type.Literal('litterbox_maintenance'),
  maintenance_type: Type.Union([
    Type.Literal('scoop'),
    Type.Literal('deep_clean'),
    Type.Literal('litter_change'),
    Type.Literal('litter_addition'),
  ]),
  litter_amount: Type.Optional(Type.Number()),
});

const StoredDeviceConnectivitySchema = Type.Object({
  type: Type.Literal('device_connectivity'),
  state: Type.Union([
    Type.Literal('online'),
    Type.Literal('offline'),
    Type.Literal('error'),
  ]),
  previous_state: Type.Optional(
    Type.Union([
      Type.Literal('online'),
      Type.Literal('offline'),
      Type.Literal('error'),
      Type.Literal('unknown'),
    ]),
  ),
});

const StoredPetPresenceSchema = Type.Object({
  type: Type.Literal('pet_presence'),
  state: Type.Union([
    Type.Literal('away'),
    Type.Literal('home'),
    Type.Literal('outside'),
  ]),
  context: Type.Optional(
    Type.Union([
      Type.Literal('vet'),
      Type.Literal('travel'),
      Type.Literal('friend'),
      Type.Literal('manual'),
    ]),
  ),
  previous_state: Type.Optional(
    Type.Union([
      Type.Literal('away'),
      Type.Literal('home'),
      Type.Literal('outside'),
      Type.Literal('unknown'),
    ]),
  ),
});

export const StoredEventDataSchema = Type.Union([
  StoredWeightMeasurementSchema,
  StoredWaterIntakeSchema,
  StoredLitterboxUseSchema,
  StoredFoodIntakeSchema,
  StoredLitterboxMaintenanceSchema,
  StoredDeviceConnectivitySchema,
  StoredPetPresenceSchema,
]);

/**
 * Corruption canary for the event `data` JSON blob: rejects out-of-band
 * garbage; does not coerce or normalize legitimate shape drift.
 */
export function parseStoredEventData(value: unknown): EventData | null {
  return parseWithSchema(StoredEventDataSchema, value) ?? null;
}
