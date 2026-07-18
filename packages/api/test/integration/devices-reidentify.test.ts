import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { encodeLitterboxRawData, LITTERBOX_RAW_DATA_VERSION_1 } from 'shared';
import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';

import { createDeviceFriendlyAccountManager } from '../helpers/accountManagerDoubles.ts';
import {
  insertDevice,
  insertLitterboxEvent,
  insertPet,
  insertProviderAccount,
  insertWeightMeasurementEvent,
} from '../helpers/fixtures.ts';
import { gramsPlateauAround } from '../helpers/litterboxAnalyzerFixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

async function clearDeviceLitterboxVisits(
  ctx: TestDbContext,
  deviceId: number,
): Promise<void> {
  const visits = await ctx.db
    .selectFrom('event')
    .select('id')
    .where('device_id', '=', deviceId)
    .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_use')
    .execute();

  const visitIds = visits.map((visit) => visit.id);
  if (visitIds.length === 0) {
    return;
  }

  await ctx.db
    .deleteFrom('event')
    .where('parent_event_id', 'in', visitIds)
    .execute();
  await ctx.db.deleteFrom('event').where('id', 'in', visitIds).execute();
}

describe('devices API litterbox reidentify', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let deviceId: number;
  let lightPetId: number;
  let heavyPetId: number;

  before(async () => {
    ctx = await createTestDb();
    const account = await insertProviderAccount(ctx.db, {
      provider: 'inference',
      name: 'Reidentify account',
    });
    const manager = createDeviceFriendlyAccountManager(account.id);
    app = await createTestApp(ctx, {
      integrationManager: createTestIntegrationManager(ctx.db, {
        accountManagers: new Map([[account.id, manager]]),
      }),
    });

    const device = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Reidentify litterbox',
      type: 'litterbox',
      external_id: 'lb-reidentify-1',
    });
    deviceId = device.id;

    const light = await insertPet(ctx.db, { name: 'Light Cat' });
    const heavy = await insertPet(ctx.db, { name: 'Heavy Cat' });
    lightPetId = light.id;
    heavyPetId = heavy.id;

    const beforeVisit = new Date('2026-05-01T09:00:00.000Z');
    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: lightPetId,
      timestamp: beforeVisit,
      weight: 3500,
    });
    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: heavyPetId,
      timestamp: beforeVisit,
      weight: 5200,
    });
  });

  beforeEach(async () => {
    await clearDeviceLitterboxVisits(ctx, deviceId);
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('reassigns misidentified visits and freezes human_verified analysis', async () => {
    const visitAt = new Date('2026-05-01T12:00:00.000Z');
    const verifiedAt = new Date('2026-05-01T14:00:00.000Z');

    const heavyRaw = Buffer.from(
      encodeLitterboxRawData({
        version: LITTERBOX_RAW_DATA_VERSION_1,
        startTimeMs: visitAt.getTime(),
        weights: gramsPlateauAround(5200, 800),
      }),
    );
    const verifiedRaw = Buffer.from(
      encodeLitterboxRawData({
        version: LITTERBOX_RAW_DATA_VERSION_1,
        startTimeMs: verifiedAt.getTime(),
        weights: gramsPlateauAround(5200, 800),
      }),
    );

    const mislabeled = await insertLitterboxEvent(ctx.db, {
      pet_id: lightPetId,
      device_id: deviceId,
      timestamp: visitAt,
      elimination_type: 'unknown',
      raw_data: heavyRaw,
    });

    const verified = await insertLitterboxEvent(ctx.db, {
      pet_id: lightPetId,
      device_id: deviceId,
      timestamp: verifiedAt,
      elimination_type: 'urination',
      elimination_weight: 18,
      human_verified: true,
      raw_data: verifiedRaw,
    });

    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: lightPetId,
      device_id: deviceId,
      parent_event_id: mislabeled.id,
      timestamp: visitAt,
      weight: 3500,
    });
    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: lightPetId,
      device_id: deviceId,
      parent_event_id: verified.id,
      timestamp: verifiedAt,
      weight: 3500,
    });

    const noRaw = await insertLitterboxEvent(ctx.db, {
      pet_id: lightPetId,
      device_id: deviceId,
      timestamp: new Date('2026-05-01T16:00:00.000Z'),
      elimination_type: 'unknown',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/devices/${deviceId}/litterbox-visits/reidentify`,
    });

    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      processed: number;
      updated_pet: number;
      updated_analysis: number;
      updated_weight: number;
      skipped: number;
    };

    assert.equal(body.processed, 3);
    assert.equal(body.updated_pet, 2);
    assert.equal(body.updated_analysis, 1);
    assert.equal(body.updated_weight, 2);
    assert.equal(body.skipped, 1);

    const fixed = await ctx.db
      .selectFrom('event')
      .selectAll()
      .where('id', '=', mislabeled.id)
      .executeTakeFirstOrThrow();
    assert.equal(fixed.pet_id, heavyPetId);
    assert.notEqual(
      (fixed.data as { elimination_type: string }).elimination_type,
      'unknown',
    );

    const mislabeledWeight = await ctx.db
      .selectFrom('event')
      .selectAll()
      .where('parent_event_id', '=', mislabeled.id)
      .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
      .executeTakeFirst();
    if (mislabeledWeight) {
      assert.equal(mislabeledWeight.pet_id, heavyPetId);
      assert.ok((mislabeledWeight.data as { weight: number }).weight > 0);
    }

    const stillVerified = await ctx.db
      .selectFrom('event')
      .selectAll()
      .where('id', '=', verified.id)
      .executeTakeFirstOrThrow();
    assert.equal(
      (stillVerified.data as { elimination_type: string }).elimination_type,
      'urination',
    );
    assert.equal(
      (stillVerified.data as { elimination_weight: number }).elimination_weight,
      18,
    );
    assert.equal(stillVerified.pet_id, heavyPetId);

    const verifiedWeight = await ctx.db
      .selectFrom('event')
      .selectAll()
      .where('parent_event_id', '=', verified.id)
      .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
      .executeTakeFirst();
    if (verifiedWeight) {
      assert.equal(verifiedWeight.pet_id, heavyPetId);
      assert.ok((verifiedWeight.data as { weight: number }).weight > 0);
    }

    const skipped = await ctx.db
      .selectFrom('event')
      .selectAll()
      .where('id', '=', noRaw.id)
      .executeTakeFirstOrThrow();
    assert.equal(skipped.pet_id, lightPetId);
    assert.equal(
      (skipped.data as { elimination_type: string }).elimination_type,
      'unknown',
    );
  });

  it('respects the after query window', async () => {
    const early = new Date('2026-06-01T10:00:00.000Z');
    const late = new Date('2026-06-02T10:00:00.000Z');

    const earlyRaw = Buffer.from(
      encodeLitterboxRawData({
        version: LITTERBOX_RAW_DATA_VERSION_1,
        startTimeMs: early.getTime(),
        weights: gramsPlateauAround(5200, 800),
      }),
    );
    const lateRaw = Buffer.from(
      encodeLitterboxRawData({
        version: LITTERBOX_RAW_DATA_VERSION_1,
        startTimeMs: late.getTime(),
        weights: gramsPlateauAround(5200, 800),
      }),
    );

    const earlyVisit = await insertLitterboxEvent(ctx.db, {
      pet_id: lightPetId,
      device_id: deviceId,
      timestamp: early,
      elimination_type: 'unknown',
      raw_data: earlyRaw,
    });
    const lateVisit = await insertLitterboxEvent(ctx.db, {
      pet_id: lightPetId,
      device_id: deviceId,
      timestamp: late,
      elimination_type: 'unknown',
      raw_data: lateRaw,
    });

    const res = await app.inject({
      method: 'POST',
      url:
        `/api/devices/${deviceId}/litterbox-visits/reidentify` +
        `?after=${encodeURIComponent('2026-06-01T23:59:59.000Z')}`,
    });

    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      processed: number;
      updated_pet: number;
      updated_analysis: number;
      updated_weight: number;
      skipped: number;
    };
    assert.equal(body.processed, 1);
    assert.equal(body.updated_pet, 1);
    assert.equal(body.updated_analysis, 1);
    assert.equal(body.skipped, 0);

    const earlyRow = await ctx.db
      .selectFrom('event')
      .select('pet_id')
      .where('id', '=', earlyVisit.id)
      .executeTakeFirstOrThrow();
    const lateRow = await ctx.db
      .selectFrom('event')
      .select('pet_id')
      .where('id', '=', lateVisit.id)
      .executeTakeFirstOrThrow();

    assert.equal(earlyRow.pet_id, lightPetId);
    assert.equal(lateRow.pet_id, heavyPetId);

  });
});
