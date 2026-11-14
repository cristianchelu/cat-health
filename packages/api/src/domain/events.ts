import type { Static } from '@fastify/type-provider-typebox';

import type {
  StoredDeviceConnectivityPreviousStateSchema,
  StoredDeviceConnectivitySchema,
  StoredDeviceConnectivityStateSchema,
  StoredDeviceEnablementSchema,
  StoredDeviceStatusCauseSchema,
  StoredEventDataSchema,
  StoredFoodIntakeSchema,
  StoredFoodIntakeTargetSchema,
  StoredFoodServedSchema,
  StoredLitterboxAnnotationSchema,
  StoredLitterboxBoutAnnotationSchema,
  StoredLitterboxMaintenanceSchema,
  StoredLitterboxUseSchema,
  StoredPetPresenceContextSchema,
  StoredPetPresencePreviousStateSchema,
  StoredPetPresenceSchema,
  StoredPetPresenceStateSchema,
  StoredWaterIntakeSchema,
  StoredWaterIntakeTargetSchema,
  StoredWeightMeasurementSchema,
  StoredWeightTargetSchema,
} from '../database/types/storedEventData.ts';

/**
 * Domain model for event payloads — the shapes business logic works with.
 *
 * They are what the `data` column holds, so each is the `Static` of its schema
 * in `database/types/storedEventData.ts`, which also validates rows on read.
 * `routes/mappers/events.ts` maps them to and from the wire DTOs in `shared`.
 */

export type WeightMeasurementEventData = Static<
  typeof StoredWeightMeasurementSchema
>;

export type WaterIntakeEventData = Static<typeof StoredWaterIntakeSchema>;

export type LitterboxBoutAnnotation = Static<
  typeof StoredLitterboxBoutAnnotationSchema
>;

export type LitterboxAnnotation = Static<
  typeof StoredLitterboxAnnotationSchema
>;

export type LitterboxUseEventData = Static<typeof StoredLitterboxUseSchema>;

export type FoodIntakeEventData = Static<typeof StoredFoodIntakeSchema>;

export type FoodIntakeFoodType = FoodIntakeEventData['food_type'];

/**
 * Food put into a bowl.
 *
 * The counterpart to `food_intake`: that is the bowl emptying, this is it
 * filling. `caused_by` carries whether a person or the appliance did it, so a
 * scheduled dispense and a hand-filled bowl share one shape. Stocking a hopper
 * is deliberately NOT this event — nothing becomes edible when a hopper is
 * loaded, and hoppers report a state, not a weight.
 */
export type FoodServedEventData = Static<typeof StoredFoodServedSchema>;

export type LitterboxMaintenanceEventData = Static<
  typeof StoredLitterboxMaintenanceSchema
>;

export type LitterboxMaintenanceEventType =
  LitterboxMaintenanceEventData['maintenance_type'];

export type DeviceConnectivityState = Static<
  typeof StoredDeviceConnectivityStateSchema
>;

/**
 * Which side moved a device-status event (`isDeviceStatusEventType`): the
 * device itself, or its whole account. Unrelated to an event's `caused_by`.
 */
export type DeviceStatusCause = Static<typeof StoredDeviceStatusCauseSchema>;

export type DeviceConnectivityPreviousState = Static<
  typeof StoredDeviceConnectivityPreviousStateSchema
>;

export type DeviceConnectivityEventData = Static<
  typeof StoredDeviceConnectivitySchema
>;

export type DeviceEnablementEventData = Static<
  typeof StoredDeviceEnablementSchema
>;

/**
 * Events that describe the device itself rather than anything a pet did:
 * nothing to attribute, nothing worth pointing a camera at.
 */
export function isDeviceStatusEventType(type: string): boolean {
  return type === 'device_connectivity' || type === 'device_enablement';
}

export type PetPresenceState = Static<typeof StoredPetPresenceStateSchema>;
export type PetPresenceContext = Static<typeof StoredPetPresenceContextSchema>;
export type PetPresencePreviousState = Static<
  typeof StoredPetPresencePreviousStateSchema
>;

export type PetPresenceEventData = Static<typeof StoredPetPresenceSchema>;

/**
 * One kind's band from this moment on. A full snapshot, plan included, so each
 * past day resolves under the setting and the plan it was set with.
 */
export type IntakeTargetEventData =
  | Static<typeof StoredFoodIntakeTargetSchema>
  | Static<typeof StoredWaterIntakeTargetSchema>;

/** Her ideal weight from this moment on, in grams; null clears it. */
export type WeightTargetEventData = Static<typeof StoredWeightTargetSchema>;

/**
 * How exact an event's `timestamp` is when it is not exact: a period known to
 * have started "in 2023" stores the start of 2023 with `year`.
 */
export type EventTimestampPrecision = 'day' | 'month' | 'year' | 'unknown';

export type EventData = Static<typeof StoredEventDataSchema>;
