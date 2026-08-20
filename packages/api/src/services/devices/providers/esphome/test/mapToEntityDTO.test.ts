import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Entity as EspHomeEntity } from 'esphome-client';

import type { Database } from '../../../../../database/index.ts';
import { FountainController } from '../FountainController.ts';
import type { Device, ProviderDeps } from '../../../types.ts';
import type { EntityDTO } from 'shared';

/** Backdoor into the protected mapper the tests exercise. */
interface ControllerAccess {
  mapToEntityDTO(entity: EspHomeEntity): EntityDTO;
}

function makeController(): ControllerAccess {
  const device = {
    id: 7,
    name: 'Fountain',
    type: 'water_fountain',
    config: { host: 'fountain.local' },
  } as unknown as Device;
  const deps = { db: {} as unknown as Kysely<Database> } as ProviderDeps;
  return new FountainController(device, deps) as unknown as ControllerAccess;
}

describe('BaseESPHomeController.mapToEntityDTO object_id derivation', () => {
  it('derives id and objectId when firmware elides object_id', () => {
    const dto = makeController().mapToEntityDTO({
      key: 1,
      type: 'sensor',
      name: 'Water Level',
      objectId: '',
    } as unknown as EspHomeEntity);

    assert.equal(dto.id, 'water_level');
    assert.equal(dto.objectId, 'water_level');
  });

  it('keeps a transmitted object_id verbatim', () => {
    const dto = makeController().mapToEntityDTO({
      key: 2,
      type: 'sensor',
      name: 'Water Level',
      objectId: 'custom_object_id',
    } as unknown as EspHomeEntity);

    assert.equal(dto.id, 'custom_object_id');
    assert.equal(dto.objectId, 'custom_object_id');
  });

  it('gives entities distinct ids so dashboard tiles stay keyable', () => {
    const controller = makeController();
    const names = ['Occupancy', 'Activity', 'Vibration', 'Cat Event'];
    const ids = names.map(
      (name, index) =>
        controller.mapToEntityDTO({
          key: index,
          type: 'binary_sensor',
          name,
          objectId: '',
        } as unknown as EspHomeEntity).id,
    );

    assert.equal(new Set(ids).size, names.length);
    assert.ok(!ids.includes(''));
  });
});
