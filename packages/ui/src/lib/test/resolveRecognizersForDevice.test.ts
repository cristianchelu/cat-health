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
  enabled: boolean;
  account_enabled: boolean;
}

/** A plain device row; switched fully on unless a test says otherwise. */
function plain(id: number, type: DeviceType): Fixture {
  return { id, type, enabled: true, account_enabled: true };
}

function recognizer(
  id: number,
  sourceDeviceId: number,
  extra: Partial<Fixture> = {},
): Fixture {
  return {
    ...plain(id, 'pet_recognizer'),
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
      plain(1, 'litterbox'),
      plain(2, 'camera'),
      plain(3, 'feeder'),
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
      plain(99, 'camera'),
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
    const devices: Fixture[] = [recognizer(10, 2), plain(1, 'litterbox')];

    assert.deepEqual(resolveRecognizersForDevice(1, devices), []);
  });
});

describe('listPetRecognizers', () => {
  it('returns every pet_recognizer regardless of source', () => {
    const devices: Fixture[] = [
      recognizer(10, 1),
      plain(2, 'camera'),
      recognizer(11, 99),
      plain(3, 'litterbox'),
    ];

    assert.deepEqual(listPetRecognizers(devices), [
      recognizer(10, 1),
      recognizer(11, 99),
    ]);
  });

  it('returns empty when there are no recognizers', () => {
    assert.deepEqual(listPetRecognizers([plain(1, 'litterbox')]), []);
  });

  // The picker is an offer list; the pair of tests below pins the asymmetry
  // with `resolveRecognizersForDevice`, which reports what is linked.
  it('drops recognizers that are switched off', () => {
    const devices: Fixture[] = [
      recognizer(10, 1),
      recognizer(11, 1, { enabled: false }),
      recognizer(12, 1, { account_enabled: false }),
    ];

    assert.deepEqual(listPetRecognizers(devices), [recognizer(10, 1)]);
  });

  it('still resolves a linked recognizer that is switched off', () => {
    const devices: Fixture[] = [recognizer(11, 1, { enabled: false })];

    assert.deepEqual(resolveRecognizersForDevice(1, devices), [
      recognizer(11, 1, { enabled: false }),
    ]);
  });
});
