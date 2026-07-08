import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import {
  insertFood,
  insertLitterboxEvent,
  insertPet,
} from '../helpers/fixtures.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('events API mutations', () => {
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

  it('creates a manual litterbox event and returns it', async () => {
    const pet = await insertPet(ctx.db, { name: 'Manual Cat' });

    const create = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: pet.id,
        device_id: null,
        parent_event_id: null,
        human_verified: true,
        data: {
          type: 'litterbox_use',
          elimination_type: 'urination',
          elimination_weight: 22,
          duration: 45,
        },
      },
    });

    assert.equal(create.statusCode, 200);
    const created = create.json();
    assert.equal(created.pet_id, pet.id);
    assert.equal(created.data.elimination_weight, 22);
    assert.equal(created.human_verified, true);
  });

  it('creates food_intake with a moisture child event', async () => {
    const pet = await insertPet(ctx.db, { name: 'Fed Cat' });
    const food = await insertFood(ctx.db, {
      name: 'Wet pouch',
      food_type: 'complete_wet',
      moisture_percent: 80,
    });

    const create = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: pet.id,
        device_id: null,
        parent_event_id: null,
        human_verified: true,
        data: {
          type: 'food_intake',
          food_type: 'unknown',
          amount: 50,
          food_id: food.id,
        },
      },
    });

    assert.equal(create.statusCode, 200);
    const parent = create.json();
    assert.equal(parent.data.food_id, food.id);
    assert.equal(parent.data.nutrients.moisture_ml, 40);
    assert.equal(parent.human_verified, true);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/events/${parent.id}`,
    });
    assert.equal(detail.statusCode, 200);
    const withChildren = detail.json();
    assert.equal(withChildren.children.length, 1);
    assert.equal(withChildren.children[0].data.type, 'water_intake');
    assert.equal(withChildren.children[0].data.amount, 40);
    assert.equal(withChildren.children[0].data.source, 'food');
  });

  it('patches human_verified and deletes an event', async () => {
    const pet = await insertPet(ctx.db, { name: 'Patch Cat' });
    const event = await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      human_verified: false,
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { human_verified: true },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().human_verified, true);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/events/${event.id}`,
    });
    assert.equal(del.statusCode, 200);
    assert.equal(del.json().success, true);

    const missing = await app.inject({
      method: 'GET',
      url: `/api/events/${event.id}`,
    });
    assert.equal(missing.statusCode, 404);
  });

  it('filters the event list by human_verified', async () => {
    const pet = await insertPet(ctx.db, { name: 'Filter Cat' });
    await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      human_verified: true,
      elimination_weight: 11,
    });
    await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      human_verified: false,
      elimination_weight: 12,
    });

    const verified = await app.inject({
      method: 'GET',
      url: `/api/events?pet_id=${pet.id}&human_verified=true`,
    });
    assert.equal(verified.statusCode, 200);
    const verifiedBody = verified.json();
    assert.equal(verifiedBody.total, 1);
    assert.equal(verifiedBody.data[0].data.elimination_weight, 11);
  });

  it('returns an empty media list for events without attachments', async () => {
    const pet = await insertPet(ctx.db, { name: 'Media Cat' });
    const event = await insertLitterboxEvent(ctx.db, { pet_id: pet.id });

    const res = await app.inject({
      method: 'GET',
      url: `/api/events/${event.id}/media`,
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), []);
  });
});
