import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceType } from 'shared';

import {
  deviceInactiveReason,
  filterMonitoringDevices,
  isMonitoringDevice,
  isRosterDevice,
  partitionRoster,
} from '../deviceMonitoring.ts';

function device(type: DeviceType): { type: DeviceType } {
  return { type };
}

interface RosterCandidate {
  type: DeviceType;
  enabled: boolean;
  account_enabled: boolean;
}

function rosterDevice(
  type: DeviceType,
  overrides: Partial<Omit<RosterCandidate, 'type'>> = {},
): RosterCandidate {
  return { type, enabled: true, account_enabled: true, ...overrides };
}

describe('isMonitoringDevice', () => {
  it('returns false for camera', () => {
    assert.equal(isMonitoringDevice(device('camera')), false);
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
      filterMonitoringDevices([device('camera'), device('camera')]),
      [],
    );
  });

  it('keeps only monitoring device types from a mixed list', () => {
    const input = [
      device('litterbox'),
      device('camera'),
      device('feeder'),
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
      device('litterbox'),
    ];

    assert.deepEqual(filterMonitoringDevices(input), [
      device('water_fountain'),
      device('feeder'),
      device('litterbox'),
    ]);
  });
});

describe('deviceInactiveReason', () => {
  it('returns null while both switches are on', () => {
    assert.equal(deviceInactiveReason(rosterDevice('litterbox')), null);
  });

  it('blames the device for its own switch', () => {
    assert.equal(
      deviceInactiveReason(rosterDevice('feeder', { enabled: false })),
      'device',
    );
  });

  it('blames the account for the account switch', () => {
    assert.equal(
      deviceInactiveReason(rosterDevice('feeder', { account_enabled: false })),
      'account',
    );
  });

  it('blames the account when both are off, since it outranks the device', () => {
    assert.equal(
      deviceInactiveReason(
        rosterDevice('feeder', { enabled: false, account_enabled: false }),
      ),
      'account',
    );
  });
});

describe('isRosterDevice', () => {
  it('keeps an enabled monitoring device on an enabled account', () => {
    assert.equal(isRosterDevice(rosterDevice('litterbox')), true);
  });

  it('drops a device the user switched off', () => {
    assert.equal(
      isRosterDevice(rosterDevice('litterbox', { enabled: false })),
      false,
    );
  });

  it('drops a device whose account is switched off', () => {
    // A disabled account is never initialized, so its devices can never
    // connect however their own switch is set.
    assert.equal(
      isRosterDevice(rosterDevice('feeder', { account_enabled: false })),
      false,
    );
  });

  it('still drops infrastructure device types that are fully enabled', () => {
    assert.equal(isRosterDevice(rosterDevice('camera')), false);
  });
});

describe('partitionRoster', () => {
  it('keeps only fully enabled monitoring devices, in order', () => {
    const input = [
      rosterDevice('water_fountain'),
      rosterDevice('camera'),
      rosterDevice('feeder', { enabled: false }),
      rosterDevice('litterbox', { account_enabled: false }),
      rosterDevice('litterbox'),
    ];

    assert.deepEqual(partitionRoster(input), {
      roster: [rosterDevice('water_fountain'), rosterDevice('litterbox')],
      emptyReason: null,
    });
  });

  it('reports none-owned for an empty list', () => {
    assert.deepEqual(partitionRoster([]), {
      roster: [],
      emptyReason: 'none-owned',
    });
  });

  // An all-off roster renders identically to an empty one, so telling someone
  // who owns three devices to add their first is a dead end: nothing on that
  // screen points back at the switch they flipped.
  it('distinguishes an all-switched-off roster from an empty one', () => {
    assert.equal(
      partitionRoster([
        rosterDevice('litterbox', { enabled: false }),
        rosterDevice('feeder', { account_enabled: false }),
      ]).emptyReason,
      'all-switched-off',
    );
  });

  it('reports none-owned when only infrastructure devices exist', () => {
    // A hidden camera is not a device you switched off, so it cannot be the
    // reason the roster is empty.
    assert.equal(
      partitionRoster([rosterDevice('camera')]).emptyReason,
      'none-owned',
    );
  });

  it('reports none-owned when the only monitoring device is a hidden camera', () => {
    assert.equal(
      partitionRoster([rosterDevice('camera', { enabled: false })]).emptyReason,
      'none-owned',
    );
  });
});
