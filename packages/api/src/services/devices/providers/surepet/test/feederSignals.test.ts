import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEVICE_SIGNAL_KEYS, type DeviceSignal } from 'shared';
import { FeederController } from '../FeederController.ts';
import type { Device, ProviderDeps } from '../../../types.ts';

/**
 * The fill ratio is `weight / target`, which real hardware pushes out of range
 * in both directions — a topped-up bowl reads over 100%, and one lifted off the
 * scale reads negative. Both reached the card before this was bounded.
 */

const device = {
  id: 1,
  name: 'Feeder',
  type: 'feeder',
  config: { product_id: 4, household_id: 1 },
} as unknown as Device;

const deps = {
  presence: { reportOnline() {}, reportOffline() {} },
  logger: console,
} as unknown as ProviderDeps;

function signalsFor(state: Record<string, unknown>): DeviceSignal[] {
  const controller = new FeederController(device, deps);
  Object.assign(controller as unknown as Record<string, unknown>, {
    feederState: { bowl_status: [], ...state },
  });
  return controller.getSignals();
}

const fillOf = (signals: DeviceSignal[]) =>
  signals.find((signal) => signal.key === DEVICE_SIGNAL_KEYS.FEEDER_FILL);

describe('SurePet feeder signals', () => {
  it('reads an overfilled bowl as full rather than over 100%', () => {
    const fill = fillOf(
      signalsFor({ fill_percentages: { total: 166, per_bowl: {} } }),
    );

    assert.ok(fill);
    assert.deepEqual(fill.value, { kind: 'percent', value: 100 });
    assert.deepEqual(fill.severity, { kind: 'percent', value: 100 });
  });

  it('does not report a negative reading as an empty bowl', () => {
    const fill = fillOf(
      signalsFor({ fill_percentages: { total: -79, per_bowl: {} } }),
    );

    assert.ok(fill);
    assert.deepEqual(fill.value, { kind: 'none' });
    assert.equal(
      fill.severity,
      undefined,
      'a scale that is not reporting must not raise an alarm',
    );
  });

  it('scores a dual bowl on its emptier half', () => {
    const fill = fillOf(
      signalsFor({
        fill_percentages: { total: 46, per_bowl: { '0': 5, '1': 88 } },
      }),
    );

    assert.ok(fill);
    assert.equal(fill.display.kind, 'split');
    assert.deepEqual(fill.severity, { kind: 'percent', value: 5 });
  });

  it('ignores an unusable half when scoring a dual bowl', () => {
    const fill = fillOf(
      signalsFor({
        fill_percentages: { total: null, per_bowl: { '0': -12, '1': 80 } },
      }),
    );

    assert.ok(fill);
    assert.deepEqual(fill.severity, { kind: 'percent', value: 80 });
  });
});
