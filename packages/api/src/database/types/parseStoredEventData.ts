import type {
  EventDataDTO,
  EventProviderData,
  LitterboxAnalysisStatePeriod,
  LitterboxUseEliminationType,
} from 'shared';
import {
  getBooleanValue,
  getNumberValue,
  getStringValue,
  isRecord,
} from 'shared';

import type {
  DeviceConnectivityPreviousState,
  DeviceConnectivityState,
  EventData,
  FoodIntakeEventData,
  FoodIntakeFoodType,
  LitterboxBoutAnnotation,
  LitterboxMaintenanceEventData,
  LitterboxMaintenanceEventType,
  LitterboxUseEventData,
  PetPresenceContext,
  PetPresenceEventData,
  PetPresencePreviousState,
  PetPresenceState,
  WaterIntakeEventData,
  WeightMeasurementEventData,
} from './EventTable.ts';

/**
 * Runtime set that must enumerate every member of union `T`.
 * Extending a persistence union without updating the list is a compile error.
 */
function unionSet<T extends string>() {
  return <const U extends readonly T[]>(
    ...values: U &
      ([T] extends [U[number]] ? unknown : { missing: Exclude<T, U[number]> })
  ): ReadonlySet<T> => new Set(values);
}

function isInUnionSet<T extends string>(
  value: string | undefined,
  allowed: ReadonlySet<T>,
): value is T {
  return value !== undefined && (allowed as ReadonlySet<string>).has(value);
}

const ELIMINATION_TYPES = unionSet<LitterboxUseEliminationType>()(
  'urination',
  'defecation',
  'both',
  'no_elimination',
  'unknown',
);
const FOOD_TYPES = unionSet<FoodIntakeFoodType>()(
  'dry',
  'wet',
  'treat',
  'unknown',
);
const MAINTENANCE_TYPES = unionSet<LitterboxMaintenanceEventType>()(
  'scoop',
  'deep_clean',
  'litter_change',
  'litter_addition',
);
const DEVICE_STATES = unionSet<DeviceConnectivityState>()(
  'online',
  'offline',
  'error',
);
const DEVICE_PREVIOUS_STATES = unionSet<DeviceConnectivityPreviousState>()(
  'online',
  'offline',
  'error',
  'unknown',
);
const PRESENCE_STATES = unionSet<PetPresenceState>()('away', 'home', 'outside');
const PRESENCE_CONTEXTS = unionSet<PetPresenceContext>()(
  'vet',
  'travel',
  'friend',
  'manual',
);
const PRESENCE_PREVIOUS_STATES = unionSet<PetPresencePreviousState>()(
  'away',
  'home',
  'outside',
  'unknown',
);
const BOUT_TYPES = unionSet<LitterboxBoutAnnotation['bout_type']>()(
  'urination',
  'defecation',
  'unknown',
);
const WATER_SOURCES = unionSet<NonNullable<WaterIntakeEventData['source']>>()(
  'drinking',
  'food',
);
const SEGMENT_ELIMINATION_TYPES = unionSet<
  NonNullable<LitterboxAnalysisStatePeriod['elimination_type']>
>()('urination', 'defecation');
const EVENT_PROVIDER_NAMES =
  unionSet<EventProviderData['provider']>()('surepet');

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  for (const entry of Object.values(value)) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      return false;
    }
  }
  return true;
}

function parseLitterboxBoutAnnotation(
  value: unknown,
): value is LitterboxBoutAnnotation {
  if (!isRecord(value)) return false;
  const boutType = getStringValue(value, 'bout_type');
  return (
    getNumberValue(value, 'bout_index') !== undefined &&
    getNumberValue(value, 't_start_s') !== undefined &&
    getNumberValue(value, 't_end_s') !== undefined &&
    isInUnionSet(boutType, BOUT_TYPES)
  );
}

function parseLitterboxAnnotation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const bouts = value.bouts;
  if (!Array.isArray(bouts) || !bouts.every(parseLitterboxBoutAnnotation)) {
    return false;
  }
  const excluded = getBooleanValue(value, 'excluded');
  return excluded === undefined || typeof excluded === 'boolean';
}

function parseLitterboxAnalysisStatePeriod(
  value: unknown,
): value is LitterboxAnalysisStatePeriod {
  if (!isRecord(value)) return false;
  const state = getStringValue(value, 'state');
  const eliminationType = getStringValue(value, 'elimination_type');
  return (
    state !== undefined &&
    getNumberValue(value, 'start') !== undefined &&
    getNumberValue(value, 'end') !== undefined &&
    (eliminationType === undefined ||
      isInUnionSet(eliminationType, SEGMENT_ELIMINATION_TYPES))
  );
}

function parseEventProviderData(value: unknown): value is EventProviderData {
  if (!isRecord(value)) return false;
  const provider = getStringValue(value, 'provider');
  if (!isInUnionSet(provider, EVENT_PROVIDER_NAMES)) return false;
  if (provider === 'surepet') {
    return getStringValue(value, 'external_key') !== undefined;
  }
  return false;
}

function parseWeightMeasurementEventData(
  record: Record<string, unknown>,
): WeightMeasurementEventData | null {
  if (getNumberValue(record, 'weight') === undefined) return null;
  return record as unknown as WeightMeasurementEventData;
}

function parseWaterIntakeEventData(
  record: Record<string, unknown>,
): WaterIntakeEventData | null {
  if (getNumberValue(record, 'amount') === undefined) return null;
  const source = getStringValue(record, 'source');
  if (source !== undefined && !isInUnionSet(source, WATER_SOURCES)) {
    return null;
  }
  if (
    getNumberValue(record, 'duration') === undefined &&
    record.duration !== undefined
  ) {
    return null;
  }
  if (
    getNumberValue(record, 'raw_amount') === undefined &&
    record.raw_amount !== undefined
  ) {
    return null;
  }
  if (
    getNumberValue(record, 'excluded_amount') === undefined &&
    record.excluded_amount !== undefined
  ) {
    return null;
  }
  const filtered = getBooleanValue(record, 'filtered');
  if (filtered === undefined && record.filtered !== undefined) return null;
  return record as unknown as WaterIntakeEventData;
}

function parseLitterboxUseEventData(
  record: Record<string, unknown>,
): LitterboxUseEventData | null {
  const eliminationType = getStringValue(record, 'elimination_type');
  if (
    !isInUnionSet(eliminationType, ELIMINATION_TYPES) ||
    getNumberValue(record, 'elimination_weight') === undefined ||
    getNumberValue(record, 'duration') === undefined
  ) {
    return null;
  }
  const straining = getBooleanValue(record, 'straining');
  if (straining === undefined && record.straining !== undefined) return null;
  if (
    record.annotation !== undefined &&
    !parseLitterboxAnnotation(record.annotation)
  ) {
    return null;
  }
  if (record.segments !== undefined && record.segments !== null) {
    if (
      !Array.isArray(record.segments) ||
      !record.segments.every(parseLitterboxAnalysisStatePeriod)
    ) {
      return null;
    }
  }
  return record as unknown as LitterboxUseEventData;
}

function parseFoodIntakeEventData(
  record: Record<string, unknown>,
): FoodIntakeEventData | null {
  const foodType = getStringValue(record, 'food_type');
  if (
    !isInUnionSet(foodType, FOOD_TYPES) ||
    getNumberValue(record, 'amount') === undefined
  ) {
    return null;
  }
  if (
    getNumberValue(record, 'food_id') === undefined &&
    record.food_id !== undefined
  ) {
    return null;
  }
  if (
    record.provider_data !== undefined &&
    !parseEventProviderData(record.provider_data)
  ) {
    return null;
  }
  if (record.nutrients !== undefined && !isNumberRecord(record.nutrients)) {
    return null;
  }
  return record as unknown as FoodIntakeEventData;
}

function parseLitterboxMaintenanceEventData(
  record: Record<string, unknown>,
): LitterboxMaintenanceEventData | null {
  const maintenanceType = getStringValue(record, 'maintenance_type');
  if (!isInUnionSet(maintenanceType, MAINTENANCE_TYPES)) return null;
  if (
    getNumberValue(record, 'litter_amount') === undefined &&
    record.litter_amount !== undefined
  ) {
    return null;
  }
  return record as unknown as LitterboxMaintenanceEventData;
}

function parseDeviceConnectivityEventData(
  record: Record<string, unknown>,
): DeviceConnectivityEventData | null {
  const state = getStringValue(record, 'state');
  if (!isInUnionSet(state, DEVICE_STATES)) return null;
  const previousState = getStringValue(record, 'previous_state');
  if (
    previousState !== undefined &&
    !isInUnionSet(previousState, DEVICE_PREVIOUS_STATES)
  ) {
    return null;
  }
  return record as unknown as DeviceConnectivityEventData;
}

function parsePetPresenceEventData(
  record: Record<string, unknown>,
): PetPresenceEventData | null {
  const state = getStringValue(record, 'state');
  if (!isInUnionSet(state, PRESENCE_STATES)) return null;
  const context = getStringValue(record, 'context');
  if (context !== undefined && !isInUnionSet(context, PRESENCE_CONTEXTS)) {
    return null;
  }
  const previousState = getStringValue(record, 'previous_state');
  if (
    previousState !== undefined &&
    !isInUnionSet(previousState, PRESENCE_PREVIOUS_STATES)
  ) {
    return null;
  }
  return record as unknown as PetPresenceEventData;
}

type DeviceConnectivityEventData = Extract<
  EventData,
  { type: 'device_connectivity' }
>;

/**
 * Persistence-owned corruption canary for the event `data` JSON blob.
 * Rejects out-of-band garbage; does not coerce or normalize legitimate shape drift.
 */
export function parseStoredEventData(value: unknown): EventData | null {
  if (!isRecord(value)) return null;

  const type = getStringValue(value, 'type');
  switch (type) {
    case 'weight_measurement':
      return parseWeightMeasurementEventData(value);
    case 'water_intake':
      return parseWaterIntakeEventData(value);
    case 'litterbox_use':
      return parseLitterboxUseEventData(value);
    case 'food_intake':
      return parseFoodIntakeEventData(value);
    case 'litterbox_maintenance':
      return parseLitterboxMaintenanceEventData(value);
    case 'device_connectivity':
      return parseDeviceConnectivityEventData(value);
    case 'pet_presence':
      return parsePetPresenceEventData(value);
    default:
      return null;
  }
}

/** Shapes currently mirror DTOs; explicit cast at the read boundary until variants diverge. */
export function storedEventDataToDto(data: EventData): EventDataDTO {
  return data as unknown as EventDataDTO;
}

/** Wire body validated by Fastify; cast at the write boundary until variants diverge. */
export function dtoEventDataToStored(data: EventDataDTO): EventData {
  return data as unknown as EventData;
}
