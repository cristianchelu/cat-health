import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';

import type { Database } from '../../../../../database/index.ts';
import { FountainController } from '../FountainController.ts';
import type { Device, ProviderDeps } from '../../../types.ts';

type Handler = (payload: Record<string, unknown>) => void;

/**
 * The real client has no way to inject a state event, so the controller's
 * client is swapped for a recorder before its listeners are attached.
 */
function makeWiredController() {
  const device = {
    id: 7,
    name: 'Fountain',
    type: 'water_fountain',
    config: { host: 'fountain.local' },
  } as unknown as Device;
  const deps = {
    db: {} as unknown as Kysely<Database>,
    presence: { recordActivity: () => {} },
  } as unknown as ProviderDeps;
  const controller = new FountainController(device, deps);
  const handlers = new Map<string, Handler>();
  const access = controller as unknown as {
    client: { on: (event: string, handler: Handler) => void };
    setupListeners(): void;
  };
  access.client = {
    on: (event, handler) => {
      handlers.set(event, handler);
    },
  };
  access.setupListeners();

  const emit = (event: string, payload: Record<string, unknown>) => {
    const handler = handlers.get(event);
    assert.ok(handler, `no listener for ${event}`);
    handler(payload);
  };
  const sensors = () =>
    (controller.getState() as { sensors: Record<string, unknown> }).sensors;
  return { emit, sensors };
}

describe('BaseESPHomeController state listeners', () => {
  it('records the selected option of a select', () => {
    const { emit, sensors } = makeWiredController();
    emit('select', { key: 11, state: 'Eco' });
    assert.equal(sensors()[11], 'Eco');
  });

  it('records text sensor and text states', () => {
    const { emit, sensors } = makeWiredController();
    emit('text_sensor', { key: 12, state: '2026.9.1' });
    emit('text', { key: 13, state: 'hello' });
    assert.equal(sensors()[12], '2026.9.1');
    assert.equal(sensors()[13], 'hello');
  });

  it('reads an elided string state as empty and missing_state as unknown', () => {
    const { emit, sensors } = makeWiredController();
    emit('text_sensor', { key: 14 });
    emit('select', { key: 15, state: 'Eco', missingState: true });
    assert.equal(sensors()[14], '');
    assert.equal(sensors()[15], undefined);
  });
});
