import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GetDeviceResponseDTO } from 'shared';

import { resolveSurePetFeederFoodCompartments } from '../resolveSurePetFeederFoodCompartments.ts';

function feeder(state: unknown): GetDeviceResponseDTO {
  return {
    id: 1,
    provider_account_id: 1,
    camera_link: null,
    provider: 'surepet',
    external_id: 'feeder-1',
    name: 'Kitchen feeder',
    type: 'feeder',
    config: null,
    enabled: true,
    account_enabled: true,
    last_seen: '2026-08-20T10:00:00.000Z',
    status: 'online',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    state: state as GetDeviceResponseDTO['state'],
  };
}

function surePetState(overrides: Record<string, unknown>) {
  return {
    provider: 'surepet',
    bowl_status: [],
    bowl_type: 1,
    bowl_type_label: 'LARGE_DRY',
    bowl_settings: [],
    lid_close_delay: 0,
    training_mode: 0,
    device_rssi: -50,
    battery_percent: 90,
    last_refreshed_at: '2026-08-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('resolveSurePetFeederFoodCompartments', () => {
  it('gives a two-bowl feeder one compartment per bowl', () => {
    const compartments = resolveSurePetFeederFoodCompartments(
      feeder(
        surePetState({
          bowl_type: 4,
          bowl_settings: [{ food_type: 2 }, { food_type: 1 }],
        }),
      ),
    );

    assert.deepEqual(compartments, [
      { id: '0', labelKey: 'devices.feeder.bowl_left' },
      { id: '1', labelKey: 'devices.feeder.bowl_right' },
    ]);
  });

  it('gives every other feeder a single compartment', () => {
    for (const state of [
      surePetState({ bowl_settings: [{ food_type: 1 }] }),
      surePetState({ bowl_type: 1 }),
      surePetState({}),
      null,
    ]) {
      const compartments = resolveSurePetFeederFoodCompartments(feeder(state));
      assert.deepEqual(compartments, [
        { id: 'default', labelKey: 'devices.feeder.food_compartment_default' },
      ]);
    }
  });
});
