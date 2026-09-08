import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';

import type { Device } from '../../src/database/types/DeviceTable.ts';
import { CameraPreviewService } from '../../src/services/devices/cameraPreview/CameraPreviewService.ts';
import {
  createStubAccountManager,
  createStubDeviceController,
} from '../helpers/accountManagerDoubles.ts';
import { insertDevice, insertProviderAccount } from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

async function solidJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 80,
      height: 80,
      channels: 3,
      background: { r: 40, g: 180, b: 60 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('device preview cache and atlas', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let camera: Device;
  let left: Device;
  let right: Device;
  let jpeg: Buffer;
  let fetches = 0;

  before(async () => {
    ctx = await createTestDb();
    jpeg = await solidJpeg();

    const account = await insertProviderAccount(ctx.db, {
      provider: 'camera',
      name: 'Cameras',
      config: {},
    });
    camera = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Hall cam',
      type: 'camera',
      external_id: 'cam-1',
    });
    left = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Left box',
      type: 'litterbox',
      external_id: 'box-left',
    });
    right = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Right box',
      type: 'litterbox',
      external_id: 'box-right',
    });

    await ctx.db
      .insertInto('device_camera')
      .values([
        {
          device_id: left.id,
          camera_id: camera.id,
          config: {
            crop: { left: 0, top: 0, width: 0.5, height: 1 },
          },
        },
        {
          device_id: right.id,
          camera_id: camera.id,
          config: {
            crop: { left: 0.5, top: 0, width: 0.5, height: 1 },
          },
        },
      ])
      .execute();

    const manager = createStubAccountManager({
      accountId: account.id,
      instantiateDeviceController: (device) => {
        if (device.id !== camera.id) {
          return createStubDeviceController(device);
        }
        return {
          ...createStubDeviceController(device),
          getSnapshotBuffer: async () => {
            fetches += 1;
            return jpeg;
          },
          captureSnapshot: async () => undefined,
        };
      },
    });

    const integrationManager = createTestIntegrationManager(ctx.db, {
      accountManagers: new Map([[account.id, manager]]),
    });
    const cameraPreview = new CameraPreviewService(ctx.db, integrationManager);
    integrationManager.bindPreviewCache(cameraPreview);

    app = await createTestApp(ctx, { integrationManager, cameraPreview });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('serves an empty layout before any frame is cached', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/devices/previews',
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().devices, []);
  });

  it('warms the camera cache from a live snapshot', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/devices/${camera.id}/snapshot`,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.ok(fetches >= 1);
  });

  it('layouts one cell per watching device from the shared frame', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/devices/previews',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.devices.length, 2);
    assert.deepEqual(
      body.devices
        .map((cell: { id: number }) => cell.id)
        .sort((a: number, b: number) => a - b),
      [left.id, right.id],
    );
  });

  it('serves a composed atlas jpeg', async () => {
    const layout = await app.inject({
      method: 'GET',
      url: '/api/devices/previews',
    });
    const generation = layout.json().generation as number;
    const res = await app.inject({
      method: 'GET',
      url: `/api/devices/previews/atlas?g=${generation}`,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    const meta = await sharp(res.rawPayload).metadata();
    assert.ok((meta.width ?? 0) >= 80);
    assert.ok((meta.height ?? 0) >= 80);
  });

  it('serves a watching-device thumbnail from the cached ROI cell', async () => {
    const before = fetches;
    const res = await app.inject({
      method: 'GET',
      url: `/api/devices/${left.id}/thumbnail`,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.equal(fetches, before);
  });

  it('serves a camera thumbnail from the cached full frame without fetching', async () => {
    const before = fetches;
    const res = await app.inject({
      method: 'GET',
      url: `/api/devices/${camera.id}/thumbnail`,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(fetches, before);
  });
});

describe('integrated fountain preview', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let fountain: Device;
  let jpeg: Buffer;
  let fetches = 0;

  before(async () => {
    ctx = await createTestDb();
    jpeg = await solidJpeg();

    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'ESPHome',
      config: {},
    });
    fountain = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Hallway Fountain',
      type: 'water_fountain',
      external_id: 'fountain-1',
      config: { host: '10.0.0.8', hasCamera: true },
    });

    const manager = createStubAccountManager({
      accountId: account.id,
      instantiateDeviceController: (device) => {
        if (device.id !== fountain.id) {
          return createStubDeviceController(device);
        }
        return {
          ...createStubDeviceController(device),
          getSnapshotBuffer: async () => {
            fetches += 1;
            return jpeg;
          },
          captureSnapshot: async () => undefined,
        };
      },
    });

    const integrationManager = createTestIntegrationManager(ctx.db, {
      accountManagers: new Map([[account.id, manager]]),
    });
    const cameraPreview = new CameraPreviewService(ctx.db, integrationManager);
    integrationManager.bindPreviewCache(cameraPreview);

    app = await createTestApp(ctx, { integrationManager, cameraPreview });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('layouts the fountain after a Camera-tab snapshot with no device_camera row', async () => {
    const snap = await app.inject({
      method: 'GET',
      url: `/api/devices/${fountain.id}/snapshot`,
    });
    assert.equal(snap.statusCode, 200);

    const layout = await app.inject({
      method: 'GET',
      url: '/api/devices/previews',
    });
    assert.equal(layout.statusCode, 200);
    assert.deepEqual(
      layout.json().devices.map((cell: { id: number }) => cell.id),
      [fountain.id],
    );
  });

  it('serves a fountain thumbnail from the cached frame', async () => {
    const before = fetches;
    const res = await app.inject({
      method: 'GET',
      url: `/api/devices/${fountain.id}/thumbnail`,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(fetches, before);
  });
});

describe('integrated fountain preview from live state', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let fountain: Device;
  let jpeg: Buffer;

  before(async () => {
    ctx = await createTestDb();
    jpeg = await solidJpeg();

    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'ESPHome',
      config: {},
    });
    fountain = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Hallway Fountain',
      type: 'water_fountain',
      external_id: 'fountain-2',
      config: { host: '10.0.0.9' },
    });

    const manager = createStubAccountManager({
      accountId: account.id,
      instantiateDeviceController: (device) => {
        if (device.id !== fountain.id) {
          return createStubDeviceController(device);
        }
        return {
          ...createStubDeviceController(device),
          getState: () => ({ hasCamera: true }),
          getSnapshotBuffer: async () => jpeg,
          captureSnapshot: async () => undefined,
        };
      },
    });

    const integrationManager = createTestIntegrationManager(ctx.db, {
      accountManagers: new Map([[account.id, manager]]),
    });
    const cameraPreview = new CameraPreviewService(ctx.db, integrationManager);
    integrationManager.bindPreviewCache(cameraPreview);

    app = await createTestApp(ctx, { integrationManager, cameraPreview });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('treats live state.hasCamera as a watcher when config has not persisted yet', async () => {
    const snap = await app.inject({
      method: 'GET',
      url: `/api/devices/${fountain.id}/snapshot`,
    });
    assert.equal(snap.statusCode, 200);

    const layout = await app.inject({
      method: 'GET',
      url: '/api/devices/previews',
    });
    assert.equal(layout.statusCode, 200);
    assert.deepEqual(
      layout.json().devices.map((cell: { id: number }) => cell.id),
      [fountain.id],
    );
  });
});
