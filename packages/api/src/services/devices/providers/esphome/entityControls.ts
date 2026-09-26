import {
  entityId,
  NotConnectedError,
  type Entity as EspHomeEntity,
  type EspHomeClient,
} from 'esphome-client';
import type {
  ControlValueType,
  DeviceControlKey,
  SettingDescriptor,
} from 'shared';

import type {
  Acceptance,
  ActionBinding,
  SettingBinding,
  WriteChannel,
} from '../../control/types.ts';
import {
  mapEspHomeEntityCategory,
  objectIdFromName,
} from './entityIdentity.ts';

/** One command to one entity, addressed the way `esphome-client` does. */
export type EntityWrite =
  | { type: 'switch'; objectId: string; state: boolean }
  | { type: 'number'; objectId: string; state: number }
  | { type: 'select'; objectId: string; state: string }
  | { type: 'button'; objectId: string };

/** The controller's latest state per entity key. */
export type EntityValues = ReadonlyMap<number, unknown>;

type WritableSetting = Exclude<EntityWrite['type'], 'button'>;

/**
 * The type is part of the key, so a firmware update that turns an entity
 * into another kind under the same name cannot be written as the old kind.
 */
const controlKey = (type: string, objectId: string): DeviceControlKey =>
  `dev:${type}.${objectId}`;

const numberField = (entity: EspHomeEntity, field: string) => {
  const value: unknown = (entity as unknown as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
};

const stringField = (entity: EspHomeEntity, field: string) => {
  const value: unknown = (entity as unknown as Record<string, unknown>)[field];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

function valueType(
  type: WritableSetting,
  entity: EspHomeEntity,
): ControlValueType {
  switch (type) {
    case 'switch':
      return { kind: 'boolean' };
    case 'number':
      return {
        kind: 'number',
        min: numberField(entity, 'minValue'),
        max: numberField(entity, 'maxValue'),
        step: numberField(entity, 'step'),
        unit: stringField(entity, 'unitOfMeasurement'),
      };
    case 'select': {
      const options: unknown = (entity as unknown as Record<string, unknown>)
        .options;
      return {
        kind: 'enum',
        options: (Array.isArray(options) ? options : [])
          .filter((option): option is string => typeof option === 'string')
          .map((option) => ({ value: option, label: { text: option } })),
      };
    }
  }
}

/** What the device last reported, or null for "not yet" and ESPHome's NaN. */
function readValue(values: EntityValues, key: number): unknown {
  const value = values.get(key);
  if (value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

function settingBinding(
  type: WritableSetting,
  entity: EspHomeEntity,
  objectId: string,
): SettingBinding<EntityWrite, EntityValues> {
  const descriptor: SettingDescriptor = {
    key: controlKey(type, objectId),
    label: { text: entity.name },
    type: valueType(type, entity),
    presentation: 'setting',
    group: mapEspHomeEntityCategory(entity),
  };
  return {
    descriptor,
    read: (values) => readValue(values, entity.key),
    // DeviceControl validated `value` against `descriptor.type` already.
    encode: (value) => [{ type, objectId, state: value } as EntityWrite],
  };
}

function buttonBinding(
  entity: EspHomeEntity,
  objectId: string,
): ActionBinding<EntityWrite, EntityValues> {
  const key = controlKey('button', objectId);
  return {
    key,
    descriptor: () => ({
      key,
      label: { text: entity.name },
      args: {},
      // ESPHome's restart, safe-mode and factory-reset buttons all declare
      // this class; a device reboot is never one tap away.
      confirm: stringField(entity, 'deviceClass') === 'restart',
      available: true,
      group: mapEspHomeEntityCategory(entity),
    }),
    encode: () => [{ type: 'button', objectId }],
  };
}

const isWritableSetting = (type: string): type is WritableSetting =>
  type === 'switch' || type === 'number' || type === 'select';

/**
 * A setting per switch, number and select, and an action per button, each
 * under the entity's own key and name. Entities the firmware marks disabled
 * by default stay hidden, as they do in Home Assistant.
 */
export function buildEntityBindings(entities: Iterable<EspHomeEntity>): {
  settings: SettingBinding<EntityWrite, EntityValues>[];
  actions: ActionBinding<EntityWrite, EntityValues>[];
} {
  const settings: SettingBinding<EntityWrite, EntityValues>[] = [];
  const actions: ActionBinding<EntityWrite, EntityValues>[] = [];
  for (const entity of entities) {
    if (
      (entity as { disabledByDefault?: unknown }).disabledByDefault === true
    ) {
      continue;
    }
    const objectId = entity.objectId || objectIdFromName(entity.name);
    if (!objectId) continue;
    if (isWritableSetting(entity.type)) {
      settings.push(settingBinding(entity.type, entity, objectId));
    } else if (entity.type === 'button') {
      actions.push(buttonBinding(entity, objectId));
    }
  }
  return { settings, actions };
}

type EntityCommandClient = Pick<EspHomeClient, 'command' | 'commandAndAwait'>;

/**
 * Sends entity commands. A state entity counts as applied once the device
 * echoes its new state; a button has no state to echo, so it counts as
 * applied once sent.
 */
export function createEntityChannel(
  client: EntityCommandClient,
): WriteChannel<EntityWrite> {
  return {
    async submit(write): Promise<Acceptance<never>> {
      try {
        switch (write.type) {
          case 'button':
            client.command(entityId('button', write.objectId), {});
            return { status: 'applied' };
          case 'switch':
            await client.commandAndAwait(entityId('switch', write.objectId), {
              state: write.state,
            });
            return { status: 'applied' };
          case 'number':
            await client.commandAndAwait(entityId('number', write.objectId), {
              state: write.state,
            });
            return { status: 'applied' };
          case 'select':
            await client.commandAndAwait(entityId('select', write.objectId), {
              state: write.state,
            });
            return { status: 'applied' };
        }
      } catch (error) {
        return entityCommandFailure(error);
      }
    },
  };
}

function entityCommandFailure(error: unknown): Acceptance<never> {
  if (error instanceof NotConnectedError) {
    return { status: 'failed', reason: 'offline' };
  }
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return {
      status: 'failed',
      reason: 'timeout',
      message: 'The device did not report the new state',
    };
  }
  return {
    status: 'failed',
    reason: 'rejected',
    message: error instanceof Error ? error.message : String(error),
  };
}
