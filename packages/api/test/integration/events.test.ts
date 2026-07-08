import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';
import { insertLitterboxEvent, insertPet } from '../helpers/fixtures.ts';

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
});
