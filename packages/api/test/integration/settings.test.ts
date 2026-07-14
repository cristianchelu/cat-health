import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_FIRST_WEEKDAY,
  DEFAULT_LANGUAGE,
  DEFAULT_NUMBER_FORMAT,
  DEFAULT_TIME_FORMAT,
  DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES,
} from 'shared';

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

  it('returns regional defaults', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(
      body.tracking_gap_threshold_minutes,
      DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES,
    );
    assert.equal(body.language, DEFAULT_LANGUAGE);
    assert.equal(body.timezone, null);
    assert.equal(body.time_format, DEFAULT_TIME_FORMAT);
    assert.equal(body.date_format, DEFAULT_DATE_FORMAT);
    assert.equal(body.first_weekday, DEFAULT_FIRST_WEEKDAY);
    assert.equal(body.number_format, DEFAULT_NUMBER_FORMAT);
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

  it('persists regional preferences', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: {
        language: 'ro',
        timezone: 'Europe/Bucharest',
        time_format: 'h24',
        date_format: 'DMY',
        first_weekday: 'monday',
        number_format: 'decimal_comma',
      },
    });
    assert.equal(patch.statusCode, 200);
    const body = patch.json();
    assert.equal(body.language, 'ro');
    assert.equal(body.timezone, 'Europe/Bucharest');
    assert.equal(body.time_format, 'h24');
    assert.equal(body.date_format, 'DMY');
    assert.equal(body.first_weekday, 'monday');
    assert.equal(body.number_format, 'decimal_comma');
  });

  it('clears timezone to system default with null', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { timezone: null },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().timezone, null);
  });

  it('clears timezone to system default with empty string', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { timezone: 'Europe/Bucharest' },
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { timezone: '' },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().timezone, null);
  });

  it('rejects an invalid timezone', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { timezone: 'Not/AZone' },
    });
    assert.equal(patch.statusCode, 400);
  });

  it('does not persist language when timezone validation fails', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/settings' });
    const originalLanguage = before.json().language;

    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: {
        language: originalLanguage === 'en' ? 'ro' : 'en',
        timezone: 'Not/AZone',
      },
    });
    assert.equal(patch.statusCode, 400);

    const after = await app.inject({ method: 'GET', url: '/api/settings' });
    assert.equal(after.json().language, originalLanguage);
  });

  it('rejects an invalid time format', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { time_format: 'h48' },
    });
    assert.equal(patch.statusCode, 400);
  });
});
