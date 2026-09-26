import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  entityId,
  NotConnectedError,
  type Entity as EspHomeEntity,
  type EspHomeClient,
} from 'esphome-client';

import { buildEntityBindings, createEntityChannel } from '../entityControls.ts';

const entity = (fields: Record<string, unknown>) =>
  ({ objectId: '', ...fields }) as unknown as EspHomeEntity;

describe('buildEntityBindings', () => {
  const { settings, actions } = buildEntityBindings([
    entity({
      key: 1,
      type: 'number',
      name: 'Calibration Known Weight',
      minValue: 1000,
      maxValue: 10000,
      step: 100,
      unitOfMeasurement: 'g',
      entityCategory: 1,
    }),
    entity({ key: 2, type: 'switch', name: 'Pump' }),
    entity({ key: 3, type: 'select', name: 'Mode', options: ['Eco', 'Boost'] }),
    entity({ key: 4, type: 'button', name: 'Restart', deviceClass: 'restart' }),
    entity({ key: 5, type: 'button', name: 'Reset Clean' }),
    entity({ key: 6, type: 'sensor', name: 'Waste Weight' }),
    entity({ key: 7, type: 'switch', name: 'Debug', disabledByDefault: true }),
  ]);
  const setting = (key: string) =>
    settings.find((binding) => binding.descriptor.key === key);
  const action = (key: string) =>
    actions.find((binding) => binding.key === key)?.descriptor(new Map());

  it('offers switches, numbers and selects as settings under typed keys', () => {
    assert.deepEqual(
      settings.map((binding) => binding.descriptor.key),
      [
        'dev:number.calibration_known_weight',
        'dev:switch.pump',
        'dev:select.mode',
      ],
    );
  });

  it('carries a number entity bounds, step, unit and category', () => {
    const descriptor = setting(
      'dev:number.calibration_known_weight',
    )?.descriptor;
    assert.deepEqual(descriptor?.type, {
      kind: 'number',
      min: 1000,
      max: 10000,
      step: 100,
      unit: 'g',
    });
    assert.equal(descriptor?.group, 'config');
    assert.deepEqual(descriptor?.label, { text: 'Calibration Known Weight' });
  });

  it('lists a select entity options as its choices', () => {
    const type = setting('dev:select.mode')?.descriptor.type;
    assert.deepEqual(
      type?.kind === 'enum' ? type.options.map((option) => option.value) : [],
      ['Eco', 'Boost'],
    );
  });

  it('offers buttons as actions and asks before a restart', () => {
    assert.equal(action('dev:button.restart')?.confirm, true);
    assert.equal(action('dev:button.reset_clean')?.confirm, false);
  });

  it('leaves out sensors and entities disabled by default', () => {
    assert.equal(setting('dev:switch.debug'), undefined);
    assert.equal(action('dev:sensor.waste_weight'), undefined);
  });

  it('reads an unknown number as null rather than NaN', () => {
    const values = new Map<number, unknown>([[1, Number.NaN]]);
    assert.equal(
      setting('dev:number.calibration_known_weight')?.read(values),
      null,
    );
  });
});

describe('createEntityChannel', () => {
  function fakeClient(awaitResult: () => Promise<unknown>) {
    const calls: Array<{ method: string; id: string; options: unknown }> = [];
    const client = {
      command: (id: string, options: unknown) => {
        calls.push({ method: 'command', id, options });
      },
      commandAndAwait: (id: string, options: unknown) => {
        calls.push({ method: 'commandAndAwait', id, options });
        return awaitResult();
      },
    } as unknown as Pick<EspHomeClient, 'command' | 'commandAndAwait'>;
    return { client, calls };
  }

  it('waits for a state entity to echo before calling it applied', async () => {
    const { client, calls } = fakeClient(async () => ({ state: true }));

    const acceptance = await createEntityChannel(client).submit({
      type: 'switch',
      objectId: 'pump',
      state: true,
    });

    assert.deepEqual(acceptance, { status: 'applied' });
    assert.deepEqual(calls, [
      {
        method: 'commandAndAwait',
        id: entityId('switch', 'pump'),
        options: { state: true },
      },
    ]);
  });

  it('presses a button without waiting for an echo', async () => {
    const { client, calls } = fakeClient(async () => {
      throw new Error('not expected');
    });

    const acceptance = await createEntityChannel(client).submit({
      type: 'button',
      objectId: 'reset_clean',
    });

    assert.deepEqual(acceptance, { status: 'applied' });
    assert.deepEqual(
      calls.map((call) => call.method),
      ['command'],
    );
  });

  it('reports a missing echo as a timeout', async () => {
    const { client } = fakeClient(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });

    const acceptance = await createEntityChannel(client).submit({
      type: 'number',
      objectId: 'target',
      state: 5,
    });

    assert.equal(
      acceptance.status === 'failed' && acceptance.reason,
      'timeout',
    );
  });

  it('reports a dropped connection as offline', async () => {
    const { client } = fakeClient(async () => {
      throw new NotConnectedError('closed');
    });

    const acceptance = await createEntityChannel(client).submit({
      type: 'select',
      objectId: 'mode',
      state: 'Eco',
    });

    assert.equal(
      acceptance.status === 'failed' && acceptance.reason,
      'offline',
    );
  });
});
