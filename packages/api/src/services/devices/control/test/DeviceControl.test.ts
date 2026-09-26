import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DeviceStatus } from 'shared';

import { EventBus } from '../../EventBus.ts';
import type { DeviceController, LiveControllerResult } from '../../types.ts';
import { composeControlSurface } from '../composeControlSurface.ts';
import {
  DEVICE_CONTROL_SETTLED,
  DeviceControl,
  type DeviceControlSettledEvent,
} from '../DeviceControl.ts';
import type { Acceptance, Settlement } from '../types.ts';

interface Write {
  key: string;
  value: unknown;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const USER = { kind: 'user' } as const;

/**
 * A device with one number setting, one switch and one button, whose channel
 * answers from a script: each write takes the next scripted acceptance, and a
 * pending one settles through a deferred the test resolves.
 */
function makeHarness(options: { status?: DeviceStatus } = {}) {
  const state = new Map<string, unknown>([
    ['dev:number.target', 40],
    ['dev:switch.pump', false],
  ]);
  const sent: Write[] = [];
  const answers: Array<() => Promise<Acceptance<Deferred<Settlement>>>> = [];
  const retired: Array<(deviceId: number) => void> = [];

  const surface = composeControlSurface<
    Write,
    Map<string, unknown>,
    Deferred<Settlement>
  >({
    state: () => state,
    settings: [
      {
        descriptor: {
          key: 'dev:number.target',
          label: { text: 'Target' },
          type: { kind: 'number', min: 0, max: 100, step: 5 },
          presentation: 'setting',
          group: 'config',
        },
        read: (s) => s.get('dev:number.target'),
        encode: (value) => [{ key: 'target', value }],
      },
      {
        descriptor: {
          key: 'dev:switch.pump',
          label: { text: 'Pump' },
          type: { kind: 'boolean' },
          presentation: 'setting',
          group: 'primary',
        },
        read: (s) => s.get('dev:switch.pump'),
        encode: (value) => [{ key: 'pump', value }],
      },
    ],
    actions: [
      {
        key: 'dev:button.reset',
        descriptor: () => ({
          key: 'dev:button.reset',
          label: { text: 'Reset' },
          args: {},
          confirm: false,
          available: true,
          group: 'config',
        }),
        encode: () => [{ key: 'reset', value: null }],
      },
    ],
    channel: {
      submit: async (write) => {
        sent.push(write);
        const answer = answers.shift();
        return answer ? answer() : { status: 'applied' };
      },
    },
    confirmer: { settle: (ref) => ref.promise },
  });

  const controller: DeviceController = {
    deviceId: 1,
    connect: async () => {},
    disconnect: async () => {},
    getStatus: () => options.status ?? 'online',
    controls: () => surface,
  };

  const eventBus = new EventBus();
  const settledEvents: DeviceControlSettledEvent[] = [];
  eventBus.subscribe<DeviceControlSettledEvent>(DEVICE_CONTROL_SETTLED, (e) =>
    settledEvents.push(e),
  );

  const control = new DeviceControl({
    context: {
      resolveLiveController: async (): Promise<LiveControllerResult> => ({
        ok: true,
        controller,
      }),
      onControllerRetired: (listener) => {
        retired.push(listener);
        return () => {};
      },
    },
    eventBus,
  });

  const settingView = (key: string) =>
    control.view(controller)?.settings.find((setting) => setting.key === key);

  return {
    control,
    controller,
    sent,
    answers,
    settledEvents,
    settingView,
    retire: (deviceId: number) =>
      retired.forEach((listener) => listener(deviceId)),
  };
}

describe('DeviceControl', () => {
  it('writes nothing when any key in a patch is invalid', async () => {
    const { control, sent } = makeHarness();

    const result = await control.applySettings(
      1,
      { 'dev:switch.pump': true, 'dev:number.target': 42 },
      USER,
    );

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'invalid');
    assert.deepEqual(sent, []);
  });

  it('refuses a key the device does not offer', async () => {
    const { control, sent } = makeHarness();

    const result = await control.applySettings(
      1,
      { 'dev:number.nope': 1 },
      USER,
    );

    assert.equal(!result.ok && result.reason, 'unknown_key');
    assert.deepEqual(sent, []);
  });

  it('refuses to write to an offline device', async () => {
    const { control, sent } = makeHarness({ status: 'offline' });

    const result = await control.runAction(1, 'dev:button.reset', {}, USER);

    assert.equal(!result.ok && result.reason, 'offline');
    assert.deepEqual(sent, []);
  });

  it('reports an applied write and publishes its settlement', async () => {
    const { control, sent, settledEvents } = makeHarness();

    const result = await control.applySettings(
      1,
      { 'dev:number.target': 45 },
      USER,
    );

    assert.ok(result.ok);
    assert.deepEqual(result.value['dev:number.target']?.outcome, {
      status: 'applied',
    });
    assert.deepEqual(sent, [{ key: 'target', value: 45 }]);
    assert.deepEqual(settledEvents, [
      {
        deviceId: 1,
        target: 'setting:dev:number.target',
        settlement: { status: 'applied' },
        origin: USER,
      },
    ]);
  });

  it('shows a pending write with its expected value until it settles', async () => {
    const { control, answers, settingView } = makeHarness();
    const confirmation = deferred<Settlement>();
    answers.push(async () => ({ status: 'pending', ref: confirmation }));

    const result = await control.applySettings(
      1,
      { 'dev:number.target': 60 },
      USER,
    );
    assert.ok(result.ok);
    const receipt = result.value['dev:number.target'];
    assert.equal(receipt?.outcome.status, 'pending');
    assert.equal(settingView('dev:number.target')?.pending?.expected, 60);

    confirmation.resolve({ status: 'applied' });
    await receipt?.settled;

    assert.equal(settingView('dev:number.target')?.pending, undefined);
  });

  it('keeps a failed write visible on the setting', async () => {
    const { control, answers, settingView } = makeHarness();
    answers.push(async () => ({
      status: 'failed',
      reason: 'timeout',
      message: 'no echo',
    }));

    await control.applySettings(1, { 'dev:switch.pump': true }, USER);

    const failed = settingView('dev:switch.pump')?.failed;
    assert.equal(failed?.reason, 'timeout');
    assert.equal(failed?.message, 'no echo');
  });

  it('sends one device its writes one at a time', async () => {
    const { control, answers, sent } = makeHarness();
    const gate = deferred<void>();
    answers.push(async () => {
      await gate.promise;
      return { status: 'applied' };
    });

    const first = control.applySettings(1, { 'dev:number.target': 50 }, USER);
    const second = control.runAction(1, 'dev:button.reset', {}, USER);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(sent, [{ key: 'target', value: 50 }]);

    gate.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(sent, [
      { key: 'target', value: 50 },
      { key: 'reset', value: null },
    ]);
  });

  it('forgets pending writes once the controller is retired', async () => {
    const { control, answers, settingView, retire } = makeHarness();
    answers.push(async () => ({
      status: 'pending',
      ref: deferred<Settlement>(),
    }));

    await control.applySettings(1, { 'dev:number.target': 70 }, USER);
    assert.ok(settingView('dev:number.target')?.pending);

    retire(1);

    assert.equal(settingView('dev:number.target')?.pending, undefined);
  });
});
