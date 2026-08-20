import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_SIGNAL_KEYS, type DeviceSignal } from 'shared';
import { FountainController } from '../FountainController.ts';
import type { Device, ProviderDeps } from '../../../types.ts';

/**
 * A fountain whose entity table and sensor readings the test writes directly,
 * standing in for a connected device. The client is constructed but never
 * connects, so nothing here touches the network.
 */
class TestFountain extends FountainController {
  bindEntity(objectId: string, key: number): void {
    this.objectIdToKeyMap.set(objectId, key);
  }

  /** A publish, exactly as the `sensor` listener delivers it. */
  publish(key: number, state: unknown): void {
    this.sensorValues.set(key, state);
    this.handleSensorUpdate(key, state);
  }

  signals(): DeviceSignal[] {
    return this.getSignals();
  }
}

const noop = () => {};

const deps = {
  db: null,
  eventBus: { publish: noop },
  mediaManager: {},
  directory: {},
  presence: { reportOnline: noop, reportOffline: noop, recordActivity: noop },
  logger: console,
} as unknown as ProviderDeps;

const device = {
  id: 1,
  name: 'Test Bowl',
  type: 'water_fountain',
  config: { host: '127.0.0.1', port: 6053 },
} as unknown as Device;

const WATER_LEVEL_KEY = 42;
const BOWL_MISSING_KEY = 43;

function fountain(): TestFountain {
  const controller = new TestFountain(device, deps);
  controller.bindEntity('water_level', WATER_LEVEL_KEY);
  controller.bindEntity('bowl_missing', BOWL_MISSING_KEY);
  return controller;
}

function waterLevel(controller: TestFountain) {
  const signal = controller
    .signals()
    .find((entry) => entry.key === DEVICE_SIGNAL_KEYS.WATER_LEVEL);
  assert.ok(signal, 'expected a water level signal');
  return signal;
}

function bowlMissing(controller: TestFountain) {
  return controller
    .signals()
    .find((entry) => entry.key === DEVICE_SIGNAL_KEYS.BOWL_MISSING);
}

describe('FountainController water level', () => {
  it('reports the last published level', () => {
    const controller = fountain();
    controller.publish(WATER_LEVEL_KEY, 83.37821960449219);

    assert.deepEqual(waterLevel(controller).value, {
      kind: 'percent',
      value: 83,
    });
  });

  /*
   * A bowl lifted off the scale publishes NaN — ESPHome's "unknown". NaN is
   * not serializable against the signal value union, so one removed bowl used
   * to fail the response for every device in the list, not just its own.
   */
  it('reads unknown, not empty, when the bowl is off its scale', () => {
    const controller = fountain();
    controller.publish(WATER_LEVEL_KEY, 83.37821960449219);
    controller.publish(WATER_LEVEL_KEY, Number.NaN);

    const signal = waterLevel(controller);
    assert.deepEqual(signal.value, { kind: 'none' });
    assert.deepEqual(signal.display, { kind: 'none' });
    /* No severity: an unknown level is not a low level, and 0% would score
     * as an empty bowl the moment it is picked up for a rinse. */
    assert.equal(signal.severity, undefined);
  });

  it('reads unknown before any reading has arrived', () => {
    assert.deepEqual(waterLevel(fountain()).value, { kind: 'none' });
  });

  it('recovers the live reading once the bowl is back', () => {
    const controller = fountain();
    controller.publish(WATER_LEVEL_KEY, 83.37821960449219);
    controller.publish(WATER_LEVEL_KEY, Number.NaN);
    controller.publish(WATER_LEVEL_KEY, 12.5);

    assert.deepEqual(waterLevel(controller).value, {
      kind: 'percent',
      value: 13,
    });
  });
});

describe('FountainController bowl presence', () => {
  it('explains the missing level while the bowl is off', () => {
    const controller = fountain();
    controller.publish(BOWL_MISSING_KEY, true);

    const signal = bowlMissing(controller);
    assert.ok(signal, 'expected a bowl missing signal');
    assert.deepEqual(signal.value, {
      kind: 'text',
      key: 'devices.signals.values.bowl_removed',
    });
    assert.deepEqual(signal.severity, { kind: 'flag', value: 1 });
  });

  it('stays quiet while the bowl is in place', () => {
    const controller = fountain();
    controller.publish(BOWL_MISSING_KEY, false);

    assert.equal(bowlMissing(controller), undefined);
  });

  it('says nothing on a device without the sensor', () => {
    const controller = new TestFountain(device, deps);
    controller.bindEntity('water_level', WATER_LEVEL_KEY);
    controller.publish(WATER_LEVEL_KEY, 50);

    assert.equal(bowlMissing(controller), undefined);
  });
});
