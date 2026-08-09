import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceType } from 'shared';

import {
  filterMonitoringDevices,
  isMonitoringDevice,
} from '../deviceMonitoring.ts';

function device(type: DeviceType): { type: DeviceType } {
  return { type };
}

describe('isMonitoringDevice', () => {
  it('returns false for camera and pet_recognizer', () => {
    assert.equal(isMonitoringDevice(device('camera')), false);
    assert.equal(isMonitoringDevice(device('pet_recognizer')), false);
  });

  it('returns true for litterbox, feeder, and water_fountain', () => {
    assert.equal(isMonitoringDevice(device('litterbox')), true);
    assert.equal(isMonitoringDevice(device('feeder')), true);
    assert.equal(isMonitoringDevice(device('water_fountain')), true);
  });
});

describe('filterMonitoringDevices', () => {
  it('returns an empty array for empty input', () => {
    assert.deepEqual(filterMonitoringDevices([]), []);
  });

  it('returns an empty array when every device is excluded', () => {
    assert.deepEqual(
      filterMonitoringDevices([
        device('camera'),
        device('pet_recognizer'),
      ]),
      [],
    );
  });

  it('keeps only monitoring device types from a mixed list', () => {
    const input = [
      device('litterbox'),
      device('camera'),
      device('feeder'),
      device('pet_recognizer'),
      device('water_fountain'),
    ];

    assert.deepEqual(filterMonitoringDevices(input), [
      device('litterbox'),
      device('feeder'),
      device('water_fountain'),
    ]);
  });

  it('preserves the relative order of kept devices', () => {
    const input = [
      device('water_fountain'),
      device('camera'),
      device('feeder'),
      device('pet_recognizer'),
      device('litterbox'),
    ];

    assert.deepEqual(filterMonitoringDevices(input), [
      device('water_fountain'),
      device('feeder'),
      device('litterbox'),
    ]);
  });
});
