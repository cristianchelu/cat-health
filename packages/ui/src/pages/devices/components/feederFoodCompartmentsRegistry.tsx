import type { GetDeviceResponseDTO } from 'shared';
import { buildFeederFoodCompartmentsPayload, parseFeederFoodCompartments } from 'shared';
import { isRecord } from '@/lib/utils';
import { resolveSurePetFeederFoodCompartments } from './surepet/resolveSurePetFeederFoodCompartments';

export interface FeederFoodCompartmentDescriptor {
  id: string;
  /** i18n key for compartment label */
  labelKey: string;
}

interface FeederFoodCompartmentsRegistration {
  id: string;
  provider?: string;
  type?: GetDeviceResponseDTO['type'];
  resolve: (device: GetDeviceResponseDTO) => FeederFoodCompartmentDescriptor[];
}

const defaultResolve = (): FeederFoodCompartmentDescriptor[] => [
  { id: 'default', labelKey: 'devices.feeder.food_compartment_default' },
];

const feederFoodCompartmentsRegistry: FeederFoodCompartmentsRegistration[] = [
  {
    id: 'surepet-feeder',
    provider: 'surepet',
    type: 'feeder',
    resolve: resolveSurePetFeederFoodCompartments,
  },
  {
    id: 'feeder-default',
    type: 'feeder',
    resolve: defaultResolve,
  },
];

function registrationMatchesDevice(
  registration: FeederFoodCompartmentsRegistration,
  device: GetDeviceResponseDTO,
): boolean {
  if (registration.provider && registration.provider !== device.provider) {
    return false;
  }
  if (registration.type && registration.type !== device.type) {
    return false;
  }
  return true;
}

export function resolveFeederFoodCompartments(
  device: GetDeviceResponseDTO,
): FeederFoodCompartmentDescriptor[] {
  const registration =
    feederFoodCompartmentsRegistry.find(
      (candidate) =>
        registrationMatchesDevice(candidate, device) && candidate.provider != null,
    ) ??
    feederFoodCompartmentsRegistry.find(
      (candidate) =>
        registrationMatchesDevice(candidate, device) && candidate.provider == null,
    );

  const resolved = registration?.resolve(device) ?? defaultResolve();

  const configMap = parseFeederFoodCompartments(device.config);
  const byId = new Map(resolved.map((row) => [row.id, row]));

  for (const compartmentId of configMap.keys()) {
    if (!byId.has(compartmentId)) {
      byId.set(compartmentId, {
        id: compartmentId,
        labelKey: 'devices.feeder.food_compartment_numbered',
      });
    }
  }

  return [...byId.values()];
}

export function readFeederFoodAssignments(
  config: unknown,
): Map<string, number | null> {
  const linked = parseFeederFoodCompartments(config);
  const result = new Map<string, number | null>();
  if (!isRecord(config) || !Array.isArray(config.food_compartments)) {
    return result;
  }

  for (const entry of config.food_compartments) {
    if (!isRecord(entry)) continue;
    const compartment = entry.compartment;
    if (typeof compartment !== 'string' || compartment.length === 0) continue;
    const foodId = entry.food_id;
    if (typeof foodId === 'number' && Number.isFinite(foodId)) {
      result.set(compartment, foodId);
    } else {
      result.set(compartment, null);
    }
  }

  for (const [id, foodId] of linked) {
    if (!result.has(id)) {
      result.set(id, foodId);
    }
  }

  return result;
}

export function mergeFeederFoodCompartmentsIntoConfig(
  existingConfig: unknown,
  assignments: Map<string, number | null>,
  compartmentOrder: string[],
): Record<string, unknown> {
  const base = isRecord(existingConfig) ? { ...existingConfig } : {};
  const rows = compartmentOrder.map((compartment) => ({
    compartment,
    food_id: assignments.get(compartment) ?? null,
  }));
  return {
    ...base,
    food_compartments: buildFeederFoodCompartmentsPayload(rows),
  };
}
