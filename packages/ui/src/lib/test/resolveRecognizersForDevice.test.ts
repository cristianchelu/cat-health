import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceType } from 'shared';

import {
  listPetRecognizers,
  resolveRecognizersForDevice,
} from '../resolveRecognizersForDevice.ts';

interface Fixture {
  id: number;
  type: DeviceType;
  name?: string;
  config?: unknown;
}

function recognizer(
  id: number,
  sourceDeviceId: number,
  extra: Partial<Fixture> = {},
): Fixture {
  return {
    id,
    type: 'pet_recognizer',
    name: `Recognizer ${id}`,
    config: { source_device_id: sourceDeviceId, model: 'test' },
    ...extra,
  };
}

describe('resolveRecognizersForDevice', () => {
  it('returns an empty array for empty input', () => {
    assert.deepEqual(resolveRecognizersForDevice(1, []), []);
  });

  it('returns recognizers linked to the source device id', () => {
    const devices: Fixture[] = [
      recognizer(10, 1),
      recognizer(11, 2),
      recognizer(12, 1),
    ];

    assert.deepEqual(resolveRecognizersForDevice(1, devices), [
      recognizer(10, 1),
      recognizer(12, 1),
    ]);
  });

  it('ignores non-recognizer devices', () => {
    const devices: Fixture[] = [
      { id: 1, type: 'litterbox' },
      { id: 2, type: 'camera' },
      { id: 3, type: 'feeder' },
      recognizer(10, 1),
    ];

    assert.deepEqual(resolveRecognizersForDevice(1, devices), [
      recognizer(10, 1),
    ]);
  });

  it('ignores recognizers with missing or invalid config', () => {
    const devices: Fixture[] = [
      recognizer(10, 1, { config: undefined }),
      recognizer(11, 1, { config: null }),
      recognizer(12, 1, { config: 'invalid' }),
      recognizer(13, 1, { config: {} }),
      recognizer(14, 1, { config: { source_device_id: '1' } }),
      recognizer(15, 1),
    ];

    assert.deepEqual(resolveRecognizersForDevice(1, devices), [
      recognizer(15, 1),
    ]);
  });

  it('preserves input order', () => {
    const devices: Fixture[] = [
      recognizer(30, 5),
      { id: 99, type: 'camera' },
      recognizer(10, 5),
      recognizer(20, 5),
    ];

    assert.deepEqual(resolveRecognizersForDevice(5, devices), [
      recognizer(30, 5),
      recognizer(10, 5),
      recognizer(20, 5),
    ]);
  });

  it('returns empty when no recognizers match the source device', () => {
    const devices: Fixture[] = [
      recognizer(10, 2),
      { id: 1, type: 'litterbox' },
    ];

    assert.deepEqual(resolveRecognizersForDevice(1, devices), []);
  });
});

describe('listPetRecognizers', () => {
  it('returns every pet_recognizer regardless of source', () => {
    const devices: Fixture[] = [
      recognizer(10, 1),
      { id: 2, type: 'camera' },
      recognizer(11, 99),
      { id: 3, type: 'litterbox' },
    ];

    assert.deepEqual(listPetRecognizers(devices), [
      recognizer(10, 1),
      recognizer(11, 99),
    ]);
  });

  it('returns empty when there are no recognizers', () => {
    assert.deepEqual(listPetRecognizers([{ id: 1, type: 'litterbox' }]), []);
  });
});
