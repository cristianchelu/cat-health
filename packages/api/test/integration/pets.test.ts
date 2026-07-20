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
    assert.equal(created.birth_date, '2020-01-01');
    assert.equal(created.is_away, false);
    assert.ok(created.id);

    const list = await app.inject({ method: 'GET', url: '/api/pets' });
    assert.equal(list.statusCode, 200);
    const pets = list.json();
    assert.equal(pets.length, 1);
    assert.equal(pets[0].name, 'Mochi');
    assert.equal(pets[0].id, created.id);
  });

  it('treats omitted, null, and empty birth_date as unknown on create', async () => {
    for (const [name, payload] of [
      ['Omit', { name: 'NoDate Omit', breed: 'Unknown' }],
      ['Null', { name: 'NoDate Null', breed: 'Unknown', birth_date: null }],
      ['Empty', { name: 'NoDate Empty', breed: 'Unknown', birth_date: '' }],
    ] as const) {
      const create = await app.inject({
        method: 'POST',
        url: '/api/pets',
        payload,
      });
      assert.equal(create.statusCode, 200, name);
      assert.equal(create.json().birth_date, null, name);
    }
  });

  it('rejects invalid birth_date', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/pets',
      payload: {
        name: 'BadDate',
        breed: 'bla',
        birth_date: 'not-a-date',
      },
    });
    assert.equal(invalid.statusCode, 400);
  });

  it('clears birth_date on patch with null without touching other fields', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/pets',
      payload: {
        name: 'Clearable',
        breed: 'Unknown',
        birth_date: '2018-05-01',
      },
    });
    const { id } = create.json();

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/pets/${id}`,
      payload: { birth_date: null },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().name, 'Clearable');
    assert.equal(patch.json().birth_date, null);
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
    assert.equal(patch.json().birth_date, '2019-06-15');

    const del = await app.inject({ method: 'DELETE', url: `/api/pets/${id}` });
    assert.equal(del.statusCode, 200);
    assert.equal(del.json().success, true);

    const list = await app.inject({ method: 'GET', url: '/api/pets' });
    assert.equal(
      list.json().some((pet: { id: number }) => pet.id === id),
      false,
    );
  });
});
