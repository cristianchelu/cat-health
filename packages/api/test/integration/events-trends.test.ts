import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { format } from 'date-fns';
import type { FastifyInstance } from 'fastify';

import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';
import {
  insertLitterboxEvent,
  insertPet,
  insertWaterIntakeEvent,
} from '../helpers/fixtures.ts';

describe('events API trends', () => {
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

  it('aggregates water intake for the requested day window', async () => {
    const pet = await insertPet(ctx.db, { name: 'Hydration Cat' });
    const today = new Date();
    await insertWaterIntakeEvent(ctx.db, {
      pet_id: pet.id,
      amount: 42,
      timestamp: today,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/events/water-trends/${pet.id}?days=1&timezone=UTC`,
    });

    assert.equal(res.statusCode, 200);
    const days = res.json() as Array<{ date: string; amount: number }>;
    const todayKey = format(today, 'yyyy-MM-dd');
    const todayBucket = days.find((day) => day.date === todayKey);

    assert.ok(todayBucket);
    assert.equal(todayBucket.amount, 42);
  });

  it('returns litterbox visits inside the requested date range', async () => {
    const pet = await insertPet(ctx.db, { name: 'Litter Cat' });
    const visitAt = new Date('2026-03-10T15:30:00.000Z');

    await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: visitAt,
      elimination_type: 'urination',
      elimination_weight: 28,
    });

    const res = await app.inject({
      method: 'GET',
      url:
        `/api/events/litterbox-trends/${pet.id}` +
        `?startTime=2026-03-10T00:00:00.000Z` +
        `&endTime=2026-03-10T23:59:59.999Z` +
        `&timezone=UTC`,
    });

    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      days: Array<{ date: string; events: Array<{ id: number }> }>;
    };

    const day = body.days.find((entry) => entry.date === '2026-03-10');
    assert.ok(day);
    assert.equal(day.events.length, 1);
  });
});
