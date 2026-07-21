import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { subDays } from 'date-fns';
import type { FastifyInstance } from 'fastify';

import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';
import {
  insertFood,
  insertFoodIntakeEvent,
  insertLitterboxEvent,
  insertPet,
  insertWaterIntakeEvent,
  insertWeightMeasurementEvent,
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
    const anchor = new Date();
    await insertWaterIntakeEvent(ctx.db, {
      pet_id: pet.id,
      amount: 42,
      timestamp: anchor,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/events/water-trends/${pet.id}?days=2&timezone=UTC`,
    });

    assert.equal(res.statusCode, 200);
    const days = res.json() as Array<{ date: string; amount: number }>;
    const bucket = days.find((day) => day.amount === 42);

    assert.ok(bucket);
    assert.equal(bucket.amount, 42);
  });

  it('returns an empty water series when the pet has never had water events', async () => {
    const pet = await insertPet(ctx.db, { name: 'Dry Cat' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/events/water-trends/${pet.id}?days=7&timezone=UTC`,
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), []);
  });

  it('returns an empty food series when the pet has never had food events', async () => {
    const pet = await insertPet(ctx.db, { name: 'Fasting Cat' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/events/food-trends/${pet.id}?days=7&timezone=UTC`,
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), []);
  });

  it('still returns a zero-filled water series when the pet has prior intake history', async () => {
    const pet = await insertPet(ctx.db, { name: 'History Cat' });
    await insertWaterIntakeEvent(ctx.db, {
      pet_id: pet.id,
      amount: 30,
      timestamp: subDays(new Date(), 40),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/events/water-trends/${pet.id}?days=2&timezone=UTC`,
    });

    assert.equal(res.statusCode, 200);
    const days = res.json() as Array<{
      date: string;
      amount: number;
      tracked: boolean;
    }>;
    assert.equal(days.length, 2);
    assert.ok(days.every((day) => day.amount === 0));
  });

  it('excludes out-of-range litterbox visits and includes detail fields', async () => {
    const pet = await insertPet(ctx.db, { name: 'Detail Cat' });
    const inside = new Date('2026-04-12T12:00:00.000Z');
    const outside = new Date('2026-04-11T12:00:00.000Z');

    const visit = await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: inside,
      elimination_type: 'defecation',
      elimination_weight: 35,
      duration: 90,
      human_verified: true,
    });
    await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: outside,
      elimination_type: 'urination',
      elimination_weight: 20,
    });

    const res = await app.inject({
      method: 'GET',
      url:
        `/api/events/litterbox-trends/${pet.id}` +
        `?startTime=2026-04-12T00:00:00.000Z` +
        `&endTime=2026-04-12T23:59:59.999Z` +
        `&timezone=UTC&detail=true`,
    });

    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      days: Array<{
        date: string;
        events: Array<{
          id?: number;
          elimination_weight?: number;
          human_verified?: boolean;
          type: string;
        }>;
        summary?: { defecationCount: number; urinationCount: number };
      }>;
      lastPee: string | null;
      lastPoop: string | null;
    };

    const day = body.days.find((entry) => entry.date === '2026-04-12');
    assert.ok(day);
    assert.equal(day.events.length, 1);
    assert.equal(day.events[0].id, visit.id);
    assert.equal(day.events[0].elimination_weight, 35);
    assert.equal(day.events[0].human_verified, true);
    assert.equal(day.events[0].type, 'defecation');
    assert.ok(day.summary);
    assert.equal(day.summary.defecationCount, 1);
    assert.equal(day.summary.urinationCount, 0);
    assert.equal(body.lastPee, null);
    assert.equal(body.lastPoop, inside.toISOString());
  });

  it('returns weight points inside the days window only', async () => {
    const pet = await insertPet(ctx.db, { name: 'Weight Cat' });
    const anchor = new Date();
    const recent = subDays(anchor, 2);
    const old = subDays(anchor, 40);

    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: recent,
      weight: 4100,
    });
    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: old,
      weight: 3900,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/events/weight-trends/${pet.id}?days=7&timezone=UTC`,
    });

    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      points: Array<{ weight: number; timestamp: string }>;
    };

    assert.equal(body.points.length, 1);
    assert.equal(body.points[0].weight, 4100);
  });

  it('aggregates food trends as calories with weight-based bounds', async () => {
    const pet = await insertPet(ctx.db, { name: 'Calorie Cat' });
    const anchor = new Date();
    const food = await insertFood(ctx.db, {
      name: 'Calorie pouch',
      food_type: 'complete_wet',
      moisture_percent: 80,
      calories_per_100g: 100,
    });

    await insertFoodIntakeEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: anchor,
      food_type: 'wet',
      amount: 50,
      food_id: food.id,
      nutrients: { calories: 50 },
    });
    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: anchor,
      weight: 4000,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/events/food-trends/${pet.id}?days=2&timezone=UTC`,
    });

    assert.equal(res.statusCode, 200);
    const days = res.json() as Array<{
      date: string;
      amount: number;
      lowerBound: number;
      upperBound: number;
      averageWeight: number;
    }>;
    const bucket = days.find((day) => day.amount === 50);
    assert.ok(bucket);
    assert.equal(bucket.amount, 50);
    assert.equal(bucket.averageWeight, 4000);

    const fallbackLower = 220 * 0.8;
    const fallbackUpper = 220 * 1.2;
    assert.notEqual(bucket.lowerBound, fallbackLower);
    assert.notEqual(bucket.upperBound, fallbackUpper);
  });
});
