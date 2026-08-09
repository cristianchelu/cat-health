import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';

import { createDeviceFriendlyAccountManager } from '../helpers/accountManagerDoubles.ts';
import { insertDevice, insertProviderAccount } from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('PUT /api/devices/:id/recognizer', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let accountId: number;
  let seq = 0;

  before(async () => {
    ctx = await createTestDb();
    const account = await insertProviderAccount(ctx.db, {
      provider: 'inference',
      name: 'Recognizer account',
    });
    accountId = account.id;
    app = await createTestApp(ctx, {
      integrationManager: createTestIntegrationManager(ctx.db, {
        accountManagers: new Map([
          [account.id, createDeviceFriendlyAccountManager(account.id)],
        ]),
      }),
    });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  function insertRecognizer(name: string, sourceDeviceId?: number) {
    return insertDevice(ctx.db, {
      provider_account_id: accountId,
      name,
      type: 'pet_recognizer',
      external_id: `recognizer-${++seq}`,
      config: {
        model: 'test-model',
        ...(sourceDeviceId !== undefined
          ? { source_device_id: sourceDeviceId }
          : {}),
      },
    });
  }

  function insertTarget(name: string) {
    return insertDevice(ctx.db, {
      provider_account_id: accountId,
      name,
      type: 'water_fountain',
      external_id: `fountain-${++seq}`,
    });
  }

  async function getConfig(deviceId: number): Promise<Record<string, unknown>> {
    const res = await app.inject({
      method: 'GET',
      url: `/api/devices/${deviceId}`,
    });
    assert.equal(res.statusCode, 200);
    return res.json().config as Record<string, unknown>;
  }

  it('assigns a recognizer when the target has none', async () => {
    const target = await insertTarget('Fresh fountain');
    const recognizer = await insertRecognizer('Fresh recognizer');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/devices/${target.id}/recognizer`,
      payload: { recognizer_id: recognizer.id },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json().id, target.id);

    const config = await getConfig(recognizer.id);
    assert.equal(config.source_device_id, target.id);
    assert.equal(config.model, 'test-model');
  });

  it('swaps sources with the incumbent recognizer', async () => {
    const targetA = await insertTarget('Fountain A');
    const targetB = await insertTarget('Fountain B');
    const incumbent = await insertRecognizer('Incumbent', targetA.id);
    const arriving = await insertRecognizer('Arriving', targetB.id);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/devices/${targetA.id}/recognizer`,
      payload: { recognizer_id: arriving.id },
    });

    assert.equal(res.statusCode, 200);
    const arrivingConfig = await getConfig(arriving.id);
    assert.equal(arrivingConfig.source_device_id, targetA.id);
    const incumbentConfig = await getConfig(incumbent.id);
    assert.equal(incumbentConfig.source_device_id, targetB.id);
  });

  it('is a no-op when the recognizer already serves the target', async () => {
    const target = await insertTarget('Settled fountain');
    const recognizer = await insertRecognizer('Settled recognizer', target.id);

    // Pin updated_at so an accidental write is detectable even when the
    // request lands in the same millisecond.
    await ctx.db
      .updateTable('device')
      .set({ updated_at: 1000 })
      .where('id', '=', recognizer.id)
      .execute();

    const res = await app.inject({
      method: 'PUT',
      url: `/api/devices/${target.id}/recognizer`,
      payload: { recognizer_id: recognizer.id },
    });

    assert.equal(res.statusCode, 200);
    const config = await getConfig(recognizer.id);
    assert.equal(config.source_device_id, target.id);

    const row = await ctx.db
      .selectFrom('device')
      .select('updated_at')
      .where('id', '=', recognizer.id)
      .executeTakeFirstOrThrow();
    assert.equal(row.updated_at, 1000);
  });

  it('converges the degenerate duplicate state to one recognizer', async () => {
    const target = await insertTarget('Contested fountain');
    const incumbent = await insertRecognizer('Duplicate incumbent', target.id);
    const arriving = await insertRecognizer('Duplicate arriving', target.id);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/devices/${target.id}/recognizer`,
      payload: { recognizer_id: arriving.id },
    });

    assert.equal(res.statusCode, 200);
    const arrivingConfig = await getConfig(arriving.id);
    assert.equal(arrivingConfig.source_device_id, target.id);

    // The incumbent must not get the target written back into it.
    const incumbentConfig = await getConfig(incumbent.id);
    assert.equal(incumbentConfig.source_device_id, undefined);
    assert.equal(incumbentConfig.model, 'test-model');
  });

  it('404s for a missing target device', async () => {
    const recognizer = await insertRecognizer('Orphan recognizer');
    const res = await app.inject({
      method: 'PUT',
      url: '/api/devices/999999/recognizer',
      payload: { recognizer_id: recognizer.id },
    });
    assert.equal(res.statusCode, 404);
    assert.match(res.json().message, /not found/i);
  });

  it('404s for an unknown recognizer id', async () => {
    const target = await insertTarget('Lonely fountain');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/devices/${target.id}/recognizer`,
      payload: { recognizer_id: 999999 },
    });
    assert.equal(res.statusCode, 404);
    assert.match(res.json().message, /not found/i);
  });

  it('400s when the recognizer id is not a pet recognizer', async () => {
    const target = await insertTarget('Fountain with camera');
    const notARecognizer = await insertDevice(ctx.db, {
      provider_account_id: accountId,
      name: 'Just a camera',
      type: 'camera',
      external_id: `camera-${++seq}`,
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/devices/${target.id}/recognizer`,
      payload: { recognizer_id: notARecognizer.id },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().message, /not a pet recognizer/i);
  });

  it('leaves no partial state when a write fails mid-swap', async () => {
    const targetA = await insertTarget('Atomic fountain A');
    const targetB = await insertTarget('Atomic fountain B');
    const incumbent = await insertRecognizer('Atomic incumbent', targetA.id);
    const arriving = await insertRecognizer('Atomic arriving', targetB.id);

    // The incumbent is written first and the arriving recognizer last, so
    // failing the arriving row's update proves the incumbent write rolls back.
    await sql`
      CREATE TRIGGER fail_arriving_update
      BEFORE UPDATE ON device
      WHEN NEW.id = ${sql.lit(arriving.id)}
      BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END
    `.execute(ctx.db);

    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/devices/${targetA.id}/recognizer`,
        payload: { recognizer_id: arriving.id },
      });
      assert.equal(res.statusCode, 500);

      const incumbentConfig = await getConfig(incumbent.id);
      assert.equal(incumbentConfig.source_device_id, targetA.id);
      const arrivingConfig = await getConfig(arriving.id);
      assert.equal(arrivingConfig.source_device_id, targetB.id);
    } finally {
      await sql`DROP TRIGGER fail_arriving_update`.execute(ctx.db);
    }
  });
});
