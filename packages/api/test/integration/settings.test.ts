import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES } from 'shared';

import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('settings API', () => {
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

  it('returns the default tracking gap threshold', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    assert.equal(res.statusCode, 200);
    assert.equal(
      res.json().tracking_gap_threshold_minutes,
      DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES,
    );
  });

  it('persists an updated tracking gap threshold', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { tracking_gap_threshold_minutes: 45 },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().tracking_gap_threshold_minutes, 45);

    const get = await app.inject({ method: 'GET', url: '/api/settings' });
    assert.equal(get.statusCode, 200);
    assert.equal(get.json().tracking_gap_threshold_minutes, 45);
  });
});
