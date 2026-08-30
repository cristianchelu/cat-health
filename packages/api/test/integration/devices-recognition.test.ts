import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import type { Device } from '../../src/database/types/DeviceTable.ts';
import type { ProviderAccount } from '../../src/database/types/ProviderAccountTable.ts';
import { createDeviceFriendlyAccountManager } from '../helpers/accountManagerDoubles.ts';
import { insertDevice, insertProviderAccount } from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

const CONFIG = {
  model: null,
  prompt_template: 'the hallway fountain',
  auto_identify: true,
  reference_images: {},
};

describe('device recognition attachment', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let account: ProviderAccount;
  let otherAccount: ProviderAccount;
  let esphomeAccount: ProviderAccount;
  let fountain: Device;

  before(async () => {
    ctx = await createTestDb();

    account = await insertProviderAccount(ctx.db, {
      provider: 'inference',
      name: 'OpenRouter',
      config: { api_key: 'k', base_url: 'http://inference.local' },
    });
    otherAccount = await insertProviderAccount(ctx.db, {
      provider: 'inference',
      name: 'Spare key',
      config: { api_key: 'k2', base_url: 'http://inference.local' },
    });
    esphomeAccount = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'Home LAN',
    });

    fountain = await insertDevice(ctx.db, {
      provider_account_id: esphomeAccount.id,
      name: 'Hall fountain',
      type: 'water_fountain',
      external_id: 'wf-rec-1',
    });

    app = await createTestApp(ctx, {
      integrationManager: createTestIntegrationManager(ctx.db, {
        accountManagers: new Map([
          [
            esphomeAccount.id,
            createDeviceFriendlyAccountManager(esphomeAccount.id),
          ],
        ]),
      }),
    });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('links, replaces, patches, and unlinks recognition on a device', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/devices/${fountain.id}/recognition`,
      payload: { account_id: account.id, config: CONFIG },
    });
    assert.equal(put.statusCode, 200);
    assert.equal(put.json().recognition.account_id, account.id);
    assert.deepEqual(put.json().recognition.config, CONFIG);

    // PUT replaces rather than duplicating: the row is keyed on the device.
    const replace = await app.inject({
      method: 'PUT',
      url: `/api/devices/${fountain.id}/recognition`,
      payload: { account_id: otherAccount.id, config: CONFIG },
    });
    assert.equal(replace.statusCode, 200);
    assert.equal(replace.json().recognition.account_id, otherAccount.id);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/devices/${fountain.id}/recognition`,
      payload: {
        config: { ...CONFIG, auto_identify: false, ignored_pets: [3] },
      },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().recognition.account_id, otherAccount.id);
    assert.equal(patch.json().recognition.config.auto_identify, false);
    assert.deepEqual(patch.json().recognition.config.ignored_pets, [3]);

    const list = await app.inject({ method: 'GET', url: '/api/devices' });
    const listed = list
      .json()
      .find((d: { id: number }) => d.id === fountain.id);
    assert.equal(listed.recognition.account_id, otherAccount.id);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/devices/${fountain.id}/recognition`,
    });
    assert.equal(del.statusCode, 200);
    /* Null, not absent: the field is always answered, so "no recognition" is
       a value rather than a missing key. */
    assert.equal(del.json().recognition, null);

    const patchMissing = await app.inject({
      method: 'PATCH',
      url: `/api/devices/${fountain.id}/recognition`,
      payload: { config: CONFIG },
    });
    assert.equal(patchMissing.statusCode, 404);
    assert.match(
      (patchMissing.json() as { message: string }).message,
      /recognition link not found/i,
    );
  });

  it('404s for a device or an account that does not exist', async () => {
    const noDevice = await app.inject({
      method: 'PUT',
      url: '/api/devices/999999/recognition',
      payload: { account_id: account.id, config: CONFIG },
    });
    assert.equal(noDevice.statusCode, 404);

    const noAccount = await app.inject({
      method: 'PUT',
      url: `/api/devices/${fountain.id}/recognition`,
      payload: { account_id: 999999, config: CONFIG },
    });
    assert.equal(noAccount.statusCode, 404);
  });

  it('refuses an account whose provider cannot answer a vision prompt', async () => {
    // On the capability, not the provider name: an ESPHome account has
    // credentials, but nothing behind them can look at an image.
    const res = await app.inject({
      method: 'PUT',
      url: `/api/devices/${fountain.id}/recognition`,
      payload: { account_id: esphomeAccount.id, config: CONFIG },
    });
    assert.equal(res.statusCode, 400);
    assert.match(
      (res.json() as { message: string }).message,
      /does not support recognition/i,
    );
  });

  it('resolves reference images to media on the observed device', async () => {
    const media = await ctx.db
      .insertInto('media')
      .values({
        created_at: Math.floor(Date.now() / 1000),
        file_path: 'events/ref.jpg',
        mime_type: 'image/jpeg',
        file_size: 1,
        description: null,
        metadata: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const put = await app.inject({
      method: 'PUT',
      url: `/api/devices/${fountain.id}/recognition`,
      payload: {
        account_id: account.id,
        config: { ...CONFIG, reference_images: { '1': [media.id, 999999] } },
      },
    });
    assert.equal(put.statusCode, 200);

    // Enrichment now follows the attachment, not a `pet_recognizer` row — and
    // it drops ids whose media has since been deleted.
    assert.deepEqual(put.json().reference_media, {
      '1': [{ id: media.id, file_path: 'events/ref.jpg' }],
    });
  });
});
