import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('pets API', () => {
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

  it('creates a pet and lists it', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/pets',
      payload: {
        name: 'Mochi',
        breed: 'Domestic Shorthair',
        birth_date: '2020-01-01',
      },
    });

    assert.equal(create.statusCode, 200);
    const created = create.json();
    assert.equal(created.name, 'Mochi');
    assert.equal(created.breed, 'Domestic Shorthair');
    assert.equal(created.is_away, false);
    assert.ok(created.id);

    const list = await app.inject({ method: 'GET', url: '/api/pets' });
    assert.equal(list.statusCode, 200);
    const pets = list.json();
    assert.equal(pets.length, 1);
    assert.equal(pets[0].name, 'Mochi');
    assert.equal(pets[0].id, created.id);
  });

  it('updates and deletes a pet', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/pets',
      payload: {
        name: 'Patch Cat',
        breed: 'Unknown',
        birth_date: '2019-06-15',
      },
    });
    const { id } = create.json();

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/pets/${id}`,
      payload: { name: 'Renamed Cat' },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().name, 'Renamed Cat');

    const del = await app.inject({ method: 'DELETE', url: `/api/pets/${id}` });
    assert.equal(del.statusCode, 200);
    assert.equal(del.json().success, true);

    const list = await app.inject({ method: 'GET', url: '/api/pets' });
    assert.equal(list.json().some((pet: { id: number }) => pet.id === id), false);
  });
});
