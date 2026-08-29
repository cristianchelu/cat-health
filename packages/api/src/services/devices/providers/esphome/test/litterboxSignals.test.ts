import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_SIGNAL_KEYS,
  scoreDeviceSignal,
  type DeviceSignal,
} from 'shared';
import { LitterboxController } from '../LitterboxController.ts';
import type { Device, ProviderDeps } from '../../../types.ts';

/**
 * A litterbox whose entity table and readings the test writes directly. The
 * client is constructed but never connects, so nothing here touches the
 * network. Mirrors `fountainSignals.test.ts`.
 */
class TestLitterbox extends LitterboxController {
  bindEntity(objectId: string, key: number): void {
    this.objectIdToKeyMap.set(objectId, key);
  }

  publish(key: number, state: unknown): void {
    this.sensorValues.set(key, state);
  }

  litter(): DeviceSignal | undefined {
    return this.getSignals().find(
      (entry) => entry.key === DEVICE_SIGNAL_KEYS.LITTER_REMAINING,
    );
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

const REMAINING_KEY = 51;
const LEVEL_KEY = 52;
const FULL_KEY = 53;

interface BoxOptions {
  /** Older firmware exposes the weight but no percentage. */
  reportsLevel?: boolean;
  config?: Record<string, unknown>;
}

function litterbox({ reportsLevel = true, config = {} }: BoxOptions = {}) {
  const controller = new TestLitterbox(
    {
      id: 1,
      name: 'Test Box',
      type: 'litterbox',
      config: { host: '127.0.0.1', port: 6053, ...config },
    } as unknown as Device,
    deps,
  );
  controller.bindEntity('litter_remaining', REMAINING_KEY);
  controller.bindEntity('full_litter_weight', FULL_KEY);
  if (reportsLevel) {
    controller.bindEntity('litter_level', LEVEL_KEY);
  }
  return controller;
}

/** Asserts the row is there, and hands it back typed. */
function shown(controller: TestLitterbox): DeviceSignal {
  const signal = controller.litter();
  assert.ok(signal, 'expected a litter remaining signal');
  return signal;
}

describe('LitterboxController litter remaining', () => {
  /*
   * The row costs the card its gauge, and the gauge is the one slot the box
   * has to say something anchored. An ESPHome number nobody has typed into
   * publishes its protobuf default, so "no capacity yet" arrives looking
   * exactly like a finite reading of zero.
   */
  it('is withheld entirely until a full weight is set', () => {
    const controller = litterbox();
    controller.publish(REMAINING_KEY, 2.4);
    controller.publish(FULL_KEY, 0);
    controller.publish(LEVEL_KEY, Number.NaN);

    assert.equal(controller.litter(), undefined);
  });

  it('is withheld when neither the box nor the config states a capacity', () => {
    const controller = litterbox();
    controller.publish(REMAINING_KEY, 2.4);

    assert.equal(controller.litter(), undefined);
  });

  /* The composite: kilograms in the value, the box's own share in the bar. */
  it('reads kilograms and draws the reported percentage', () => {
    const controller = litterbox();
    controller.publish(REMAINING_KEY, 2.4);
    controller.publish(FULL_KEY, 4);
    controller.publish(LEVEL_KEY, 55);

    const signal = shown(controller);
    assert.deepEqual(signal.value, {
      kind: 'number',
      value: 2.4,
      unit: 'kg',
      decimals: 1,
    });
    assert.deepEqual(signal.display, { kind: 'bar', fill: 0.55 });
  });

  /*
   * The percentage is the box's, not ours: it knows what it subtracted an
   * empty-box weight from, and a bar disagreeing with the reading beside it
   * looks like a fault rather than like rounding.
   */
  it('prefers the reported percentage over dividing the weight itself', () => {
    const controller = litterbox();
    controller.publish(REMAINING_KEY, 2.4);
    controller.publish(FULL_KEY, 4);
    controller.publish(LEVEL_KEY, 48);

    assert.deepEqual(shown(controller).display, { kind: 'bar', fill: 0.48 });
  });

  it('divides the weight when the firmware reports no percentage', () => {
    const controller = litterbox({ reportsLevel: false });
    controller.publish(REMAINING_KEY, 3);
    controller.publish(FULL_KEY, 4);

    assert.deepEqual(shown(controller).display, { kind: 'bar', fill: 0.75 });
  });

  it('falls back to the configured capacity when the box states none', () => {
    const controller = litterbox({
      reportsLevel: false,
      config: { litterFullKg: 5 },
    });
    controller.publish(REMAINING_KEY, 1);

    assert.deepEqual(shown(controller).display, { kind: 'bar', fill: 0.2 });
  });

  /*
   * The band is the share, not the weight. The same 1.5 kg is comfortable in
   * a deep box and nearly bare in a shallow one, and scoring it in kilograms
   * parked every small box permanently at the top of its own card.
   */
  it('scores the share of a full box, not the kilograms left', () => {
    const deep = litterbox();
    deep.publish(REMAINING_KEY, 1.5);
    deep.publish(FULL_KEY, 12);
    deep.publish(LEVEL_KEY, 12.5);

    const shallow = litterbox();
    shallow.publish(REMAINING_KEY, 1.5);
    shallow.publish(FULL_KEY, 2);
    shallow.publish(LEVEL_KEY, 75);

    assert.deepEqual(shown(deep).severity, { kind: 'percent', value: 12.5 });
    assert.equal(scoreDeviceSignal(shown(deep)).tone, 'soon');
    assert.equal(scoreDeviceSignal(shown(shallow)).tone, 'calm');
  });
});
