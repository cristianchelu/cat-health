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

  /** One day of a trend, as the API sends it. */
  interface TrendDay {
    date: string;
    amount: number;
    lowerBound: number | null;
    upperBound: number | null;
    averageWeight: number;
  }

  /** A pet with one 50 kcal meal just now, so her food series is not empty. */
  async function fedPet(name: string): Promise<number> {
    const pet = await insertPet(ctx.db, { name });
    await insertFoodIntakeEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: new Date(),
      food_type: 'wet',
      amount: 50,
      nutrients: { calories: 50 },
    });
    return pet.id;
  }

  async function foodTrend(petId: number, days: number): Promise<TrendDay[]> {
    const res = await app.inject({
      method: 'GET',
      url: `/api/events/food-trends/${petId}?days=${days}&timezone=UTC`,
    });
    assert.equal(res.statusCode, 200);
    return res.json<TrendDay[]>();
  }

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  it('adds a food day up in calories', async () => {
    const petId = await fedPet('Calorie Cat');
    const today = (await foodTrend(petId, 2)).at(-1);
    assert.equal(today?.amount, 50);
  });

  it('judges a food day against her band at her weight', async () => {
    const petId = await fedPet('Band Cat');
    await insertWeightMeasurementEvent(ctx.db, { pet_id: petId, weight: 4000 });
    const today = (await foodTrend(petId, 2)).at(-1);
    assert.deepEqual(
      [today?.lowerBound, today?.upperBound, today?.averageWeight],
      [132, 190, 4000],
    );
  });

  it('judges a water day against her water band', async () => {
    const pet = await insertPet(ctx.db, { name: 'Water Band Cat' });
    await insertWaterIntakeEvent(ctx.db, { pet_id: pet.id, amount: 30 });
    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: pet.id,
      weight: 4000,
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/events/water-trends/${pet.id}?days=1&timezone=UTC`,
    });
    const [today] = res.json<TrendDay[]>();
    assert.deepEqual([today.lowerBound, today.upperBound], [92, 204]);
  });

  it('gives a day no band while she has never been weighed', async () => {
    const petId = await fedPet('Unweighed Cat');
    const today = (await foodTrend(petId, 1)).at(-1);
    assert.deepEqual([today?.lowerBound, today?.upperBound], [null, null]);
  });

  it('gives a day no band while the band is not tracked', async () => {
    const petId = await fedPet('Untracked Cat');
    await insertWeightMeasurementEvent(ctx.db, { pet_id: petId, weight: 4000 });
    await app.inject({
      method: 'PUT',
      url: `/api/pets/${petId}/dietary-needs`,
      payload: { food: { tracked: false, setting: { preset: 'maintain' } } },
    });
    const today = (await foodTrend(petId, 1)).at(-1);
    assert.deepEqual([today?.lowerBound, today?.upperBound], [null, null]);
  });

  it('keeps earlier days on the band that was in effect then', async () => {
    const petId = await fedPet('Band History Cat');
    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: petId,
      weight: 4000,
      timestamp: daysAgo(3),
    });
    await app.inject({
      method: 'PUT',
      url: `/api/pets/${petId}/dietary-needs`,
      payload: {
        food: { tracked: true, setting: { target: 200, tolerance: 10 } },
      },
    });
    const [yesterday, today] = await foodTrend(petId, 2);
    assert.deepEqual(
      [
        yesterday.lowerBound,
        yesterday.upperBound,
        today.lowerBound,
        today.upperBound,
      ],
      [132, 190, 190, 210],
    );
  });
});
