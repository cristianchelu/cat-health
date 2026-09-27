import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ServiceArgType,
  type ExecuteServiceArgumentValue,
  type ExecuteServiceOptions,
  type ServiceEntity,
} from 'esphome-client';

import {
  buildUserActionBindings,
  createUserActionChannel,
  type UserActionWrite,
} from '../userActionControls.ts';

const tare: ServiceEntity = {
  key: 1,
  name: 'calibration_tare',
  args: [],
  supportsResponse: 100,
};
const weigh: ServiceEntity = {
  key: 2,
  name: 'calibration_weight',
  args: [{ name: 'known_weight_kg', type: ServiceArgType.FLOAT }],
  supportsResponse: 100,
};
const setCat: ServiceEntity = {
  key: 3,
  name: 'set_cat_weight',
  args: [
    { name: 'cat', type: ServiceArgType.INT },
    { name: 'weight', type: ServiceArgType.FLOAT },
  ],
  supportsResponse: 0,
};
const rename: ServiceEntity = {
  key: 4,
  name: 'set_name',
  args: [{ name: 'name', type: ServiceArgType.STRING }],
  supportsResponse: 0,
};

describe('buildUserActionBindings', () => {
  const bindings = buildUserActionBindings([tare, weigh, setCat, rename]);
  const binding = (key: string) =>
    bindings.find((candidate) => candidate.key === key);

  it('offers each action under its name, asking before it runs', () => {
    assert.deepEqual(
      bindings.map((candidate) => candidate.key),
      [
        'dev:action.calibration_tare',
        'dev:action.calibration_weight',
        'dev:action.set_cat_weight',
      ],
    );
    const descriptor = binding('dev:action.calibration_tare')?.descriptor(
      undefined,
    );
    assert.deepEqual(descriptor?.label, { text: 'Calibration tare' });
    assert.equal(descriptor?.confirm, true);
  });

  it('types each argument, with integers stepping by one', () => {
    assert.deepEqual(
      binding('dev:action.set_cat_weight')?.descriptor(undefined).args,
      {
        cat: { kind: 'number', step: 1 },
        weight: { kind: 'number' },
      },
    );
  });

  it('leaves out an action whose arguments no control can collect', () => {
    assert.equal(binding('dev:action.set_name'), undefined);
  });

  it('sends the arguments in the order the action declares them', () => {
    assert.deepEqual(
      binding('dev:action.set_cat_weight')?.encode(
        { weight: 4.2, cat: 2 },
        undefined,
      ),
      [
        {
          type: 'action',
          name: 'set_cat_weight',
          args: [{ intValue: 2 }, { floatValue: 4.2 }],
        },
      ],
    );
  });
});

/**
 * A connected device listing `services`. `execute` records each call; the
 * test answers one through `answer`, or drops the connection.
 */
function makeDevice(services: ServiceEntity[]) {
  const calls: {
    key: number;
    args: ExecuteServiceArgumentValue[];
    options?: ExecuteServiceOptions;
  }[] = [];
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const emit = (event: string, payload: unknown) =>
    handlers.get(event)?.forEach((handler) => handler(payload));
  const client = {
    services: {
      list: () => services,
      execute: (
        key: number,
        args: ExecuteServiceArgumentValue[] = [],
        options?: ExecuteServiceOptions,
      ) => {
        calls.push({ key, args, options });
      },
    },
    on: (event: string, handler: (payload: unknown) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
      return { [Symbol.dispose]: () => set.delete(handler) };
    },
  };
  return {
    client: client as unknown as Parameters<typeof createUserActionChannel>[0],
    calls,
    answer: (callId: number, success: boolean, errorMessage?: string) =>
      emit('serviceCallResult', { callId, success, errorMessage }),
    disconnect: () => emit('disconnect', undefined),
    listeners: () =>
      [...handlers.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

const call = (name: string, args: ExecuteServiceArgumentValue[] = []) =>
  ({ type: 'action', name, args }) satisfies UserActionWrite;

describe('createUserActionChannel', () => {
  it('settles an answering action on the answer to its own call id', async () => {
    const device = makeDevice([tare]);
    const channel = createUserActionChannel(device.client);

    const pending = channel.submit(call('calibration_tare'));
    const { callId } = device.calls[0].options ?? {};
    assert.ok(callId);
    device.answer(callId + 1, false, 'not ours');
    device.answer(callId, true);

    assert.deepEqual(await pending, { status: 'applied' });
    assert.equal(device.listeners(), 0);
  });

  it('fails with the reason the device gave', async () => {
    const device = makeDevice([tare]);
    const channel = createUserActionChannel(device.client);

    const pending = channel.submit(call('calibration_tare'));
    device.answer(
      device.calls[0].options?.callId ?? 0,
      false,
      'Reading was not stable',
    );

    assert.deepEqual(await pending, {
      status: 'failed',
      reason: 'rejected',
      message: 'Reading was not stable',
    });
  });

  it('gives each call its own non-zero id', async () => {
    const device = makeDevice([tare]);
    const channel = createUserActionChannel(device.client);

    const first = channel.submit(call('calibration_tare'));
    const second = channel.submit(call('calibration_tare'));
    const [a, b] = device.calls.map((sent) => sent.options?.callId ?? 0);
    device.answer(b, true);
    device.answer(a, false, 'first');

    assert.notEqual(a, b);
    assert.deepEqual(await second, { status: 'applied' });
    assert.equal((await first).status, 'failed');
  });

  it('fires an action that never answers without a call id', async () => {
    const device = makeDevice([setCat]);
    const channel = createUserActionChannel(device.client);

    const result = await channel.submit(
      call('set_cat_weight', [{ intValue: 1 }, { floatValue: 4 }]),
    );

    assert.deepEqual(result, { status: 'applied' });
    assert.deepEqual(device.calls, [
      {
        key: 3,
        args: [{ intValue: 1 }, { floatValue: 4 }],
        options: undefined,
      },
    ]);
  });

  it('fails a call the connection dropped before it was answered', async () => {
    const device = makeDevice([tare]);
    const channel = createUserActionChannel(device.client);

    const pending = channel.submit(call('calibration_tare'));
    device.disconnect();

    assert.deepEqual(await pending, { status: 'failed', reason: 'offline' });
    assert.equal(device.listeners(), 0);
  });

  it('times out a call the device never answers', async () => {
    const device = makeDevice([tare]);
    const channel = createUserActionChannel(device.client, 5);

    const result = await channel.submit(call('calibration_tare'));

    assert.equal(result.status, 'failed');
    assert.equal(result.status === 'failed' && result.reason, 'timeout');
  });

  it('refuses an action the device no longer lists', async () => {
    const device = makeDevice([]);
    const channel = createUserActionChannel(device.client);

    const result = await channel.submit(call('calibration_tare'));

    assert.equal(result.status === 'failed' && result.reason, 'rejected');
    assert.deepEqual(device.calls, []);
  });
});
