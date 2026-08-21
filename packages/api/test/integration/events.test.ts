import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';
import type { EventData } from '../../src/domain/events.ts';
import {
  insertFoodIntakeEvent,
  insertLitterboxEvent,
  insertPet,
} from '../helpers/fixtures.ts';

describe('events API list', () => {
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

  it('paginates events newest-first for a pet', async () => {
    const pet = await insertPet(ctx.db, { name: 'Pager' });
    const base = Date.UTC(2026, 0, 10, 12, 0, 0);

    for (let i = 0; i < 5; i++) {
      await insertLitterboxEvent(ctx.db, {
        pet_id: pet.id,
        timestamp: new Date(base + i * 60_000),
        elimination_weight: 20 + i,
      });
    }

    const page = await app.inject({
      method: 'GET',
      url: `/api/events?pet_id=${pet.id}&limit=2&offset=0`,
    });

    assert.equal(page.statusCode, 200);
    const body = page.json();
    assert.equal(body.total, 5);
    assert.equal(body.limit, 2);
    assert.equal(body.offset, 0);
    assert.equal(body.hasMore, true);
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].data.elimination_weight, 24);
    assert.equal(body.data[1].data.elimination_weight, 23);
  });

  it('filters by eventType, and the total counts only matching rows', async () => {
    const pet = await insertPet(ctx.db, { name: 'Eater' });
    const base = Date.UTC(2026, 0, 12, 8, 0, 0);

    await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: new Date(base),
    });
    for (let i = 0; i < 3; i++) {
      await insertFoodIntakeEvent(ctx.db, {
        pet_id: pet.id,
        food_type: 'wet',
        amount: 40 + i,
        timestamp: new Date(base + (i + 1) * 60_000),
      });
    }

    const filtered = await app.inject({
      method: 'GET',
      url: `/api/events?pet_id=${pet.id}&eventType=food_intake`,
    });
    assert.equal(filtered.statusCode, 200);
    const body = filtered.json();
    assert.equal(body.total, 3);
    assert.equal(body.data.length, 3);
    for (const row of body.data) {
      assert.equal(row.data.type, 'food_intake');
    }
    // Newest-first still holds under the filter.
    assert.equal(body.data[0].data.amount, 42);

    const unfiltered = await app.inject({
      method: 'GET',
      url: `/api/events?pet_id=${pet.id}`,
    });
    assert.equal(unfiltered.json().total, 4);

    const rejected = await app.inject({
      method: 'GET',
      url: `/api/events?pet_id=${pet.id}&eventType=not_a_type`,
    });
    assert.equal(rejected.statusCode, 400);
  });

  it('omits raw_data from list rows; the detail fetch still carries the bytes', async () => {
    const pet = await insertPet(ctx.db, { name: 'Blob' });
    const rawData = Buffer.from([2, 1, 3, 3, 7]);
    const event = await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      raw_data: rawData,
    });

    const list = await app.inject({
      method: 'GET',
      url: `/api/events?pet_id=${pet.id}`,
    });
    assert.equal(list.statusCode, 200);
    const row = list.json().data.find((e: { id: number }) => e.id === event.id);
    assert.ok(row);
    // Sensor blobs would dominate list payloads (litterbox v2 ≈ 6 bytes/sample
    // as JSON numbers) — detail views fetch GET /events/:id instead.
    assert.ok(!('raw_data' in row));

    const detail = await app.inject({
      method: 'GET',
      url: `/api/events/${event.id}`,
    });
    assert.equal(detail.statusCode, 200);
    assert.deepEqual(detail.json().raw_data, Array.from(rawData));
  });

  it('skips corrupt rows in the list and 500s on direct fetch', async () => {
    const pet = await insertPet(ctx.db, { name: 'Corrupt' });
    const valid = await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      elimination_weight: 22,
    });

    await ctx.db
      .insertInto('event')
      .values({
        pet_id: pet.id,
        caused_by: 'pet',
        attributed_by: null,
        device_id: null,
        parent_event_id: null,
        timestamp: new Date(),
        data: {
          type: 'litterbox_use',
          elimination_weight: 'bad',
        } as unknown as EventData,
        raw_data: null,
        human_verified: false,
      })
      .execute();

    // One corrupt row must not brick the timeline: it is skipped, valid rows survive.
    const list = await app.inject({
      method: 'GET',
      url: `/api/events?pet_id=${pet.id}`,
    });
    assert.equal(list.statusCode, 200);
    const body = list.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, valid.id);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/events/${valid.id}`,
    });
    assert.equal(detail.statusCode, 200);

    // Directly fetching the corrupt row is a server-side data error, not a client error.
    const corruptDetail = await app.inject({
      method: 'GET',
      url: `/api/events/${valid.id + 1}`,
    });
    assert.equal(corruptDetail.statusCode, 500);
  });
});
