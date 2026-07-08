import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('foods API', () => {
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

  it('creates, updates, and deletes a food catalog entry', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/foods',
      payload: {
        name: 'Kibble Plus',
        food_type: 'complete_dry',
        calories_per_100g: 380,
      },
    });

    assert.equal(create.statusCode, 200);
    const created = create.json();
    assert.equal(created.name, 'Kibble Plus');
    assert.equal(created.food_type, 'complete_dry');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/foods/${created.id}`,
      payload: { name: 'Kibble Plus XL' },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().name, 'Kibble Plus XL');

    const list = await app.inject({ method: 'GET', url: '/api/foods' });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().length, 1);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/foods/${created.id}`,
    });
    assert.equal(del.statusCode, 200);
    assert.equal(del.json().success, true);

    const empty = await app.inject({ method: 'GET', url: '/api/foods' });
    assert.equal(empty.json().length, 0);
  });
});
