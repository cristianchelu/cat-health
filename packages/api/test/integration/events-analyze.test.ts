import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { encodeLitterboxRawData, LITTERBOX_RAW_DATA_VERSION_1 } from 'shared';
import type { FastifyInstance } from 'fastify';

import {
  insertLitterboxEvent,
  insertPet,
  insertWaterIntakeEvent,
  insertWeightMeasurementEvent,
} from '../helpers/fixtures.ts';
import { gramsPlateauAround } from '../helpers/litterboxAnalyzerFixtures.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('events API analyze', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;

  before(async () => {
    ctx = await createTestDb();
    app = await createTestApp(ctx);
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('recomputes litterbox segments from raw_data', async () => {
    const visitTime = new Date(Date.UTC(2026, 2, 1, 10, 0, 0));
    const pet = await insertPet(ctx.db, { name: 'Analyzer Cat' });
    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: new Date(visitTime.getTime() - 60_000),
      weight: 4200,
    });

    const weights = gramsPlateauAround(4200, 800);
    const rawData = Buffer.from(
      encodeLitterboxRawData({
        version: LITTERBOX_RAW_DATA_VERSION_1,
        startTimeMs: visitTime.getTime(),
        weights,
      }),
    );

    const event = await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: visitTime,
      elimination_type: 'unknown',
      raw_data: rawData,
    });

    const analyze = await app.inject({
      method: 'POST',
      url: `/api/events/${event.id}/analyze`,
    });

    assert.equal(analyze.statusCode, 200);
    const updated = analyze.json();
    assert.ok(Array.isArray(updated.data.segments));
    assert.ok(updated.data.segments.length > 0);
    assert.notEqual(updated.data.elimination_type, 'unknown');
  });

  it('rejects analyze when raw_data is missing', async () => {
    const pet = await insertPet(ctx.db, { name: 'No Raw Cat' });
    const event = await insertLitterboxEvent(ctx.db, { pet_id: pet.id });

    const analyze = await app.inject({
      method: 'POST',
      url: `/api/events/${event.id}/analyze`,
    });

    assert.equal(analyze.statusCode, 400);
    assert.match(analyze.json().message, /raw_data/i);
  });

  it('rejects analyze for non-litterbox events', async () => {
    const pet = await insertPet(ctx.db, { name: 'Water Cat' });
    const event = await insertWaterIntakeEvent(ctx.db, {
      pet_id: pet.id,
      amount: 5,
    });

    const analyze = await app.inject({
      method: 'POST',
      url: `/api/events/${event.id}/analyze`,
    });

    assert.equal(analyze.statusCode, 400);
    assert.match(analyze.json().message, /litterbox_use/i);
  });
});
