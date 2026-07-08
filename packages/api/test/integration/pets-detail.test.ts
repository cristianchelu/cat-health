import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import { insertPet, insertPetPresenceEvent } from '../helpers/fixtures.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('pets API detail', () => {
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

  it('returns a single pet with presence-derived is_away', async () => {
    const pet = await insertPet(ctx.db, {
      name: 'Detail Cat',
      breed: 'Siamese',
      birth_date: new Date('2018-03-20'),
    });
    await insertPetPresenceEvent(ctx.db, {
      pet_id: pet.id,
      state: 'away',
      previous_state: 'home',
    });

    const res = await app.inject({ method: 'GET', url: `/api/pets/${pet.id}` });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.name, 'Detail Cat');
    assert.equal(body.breed, 'Siamese');
    assert.equal(body.is_away, true);
    assert.equal(body.avatar_url, undefined);
  });

  it('toggles manual presence and returns the created event', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/pets',
      payload: {
        name: 'Toggle Cat',
        breed: 'Unknown',
        birth_date: '2021-01-01',
      },
    });
    const { id } = create.json();

    const away = await app.inject({
      method: 'POST',
      url: `/api/pets/${id}/presence/toggle`,
    });
    assert.equal(away.statusCode, 200);
    assert.equal(away.json().is_away, true);
    assert.equal(away.json().event.data.state, 'away');

    const home = await app.inject({
      method: 'POST',
      url: `/api/pets/${id}/presence/toggle`,
    });
    assert.equal(home.statusCode, 200);
    assert.equal(home.json().is_away, false);
    assert.equal(home.json().event.data.state, 'home');
    assert.equal(home.json().event.data.previous_state, 'away');
  });
});
