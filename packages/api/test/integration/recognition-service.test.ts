import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { EventBus } from '../../src/services/devices/EventBus.ts';
import type { DeviceMediaReadyEvent } from '../../src/services/devices/EventBus.ts';
import { RecognitionService } from '../../src/services/recognition/RecognitionService.ts';
import type {
  IdentifyFn,
  RecognitionLink,
} from '../../src/services/recognition/RecognitionService.ts';
import type { PetIdentificationResult } from '../../src/services/recognition/identification.ts';
import type { Device } from '../../src/database/types/DeviceTable.ts';
import type { ProviderAccount } from '../../src/database/types/ProviderAccountTable.ts';
import {
  insertDevice,
  insertDeviceRecognition,
  insertLitterboxEvent,
  insertPet,
  insertProviderAccount,
} from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

/**
 * The real `identifyPetFromMedia` reaches an inference provider over the
 * network; the seam exists so these tests can answer for it and assert on
 * whether it was reached at all.
 */
function fakeIdentify(result: PetIdentificationResult): {
  identify: IdentifyFn;
  calls: number[];
} {
  const calls: number[] = [];
  return {
    calls,
    identify: async (_db, _config, _accountConfig, mediaId) => {
      calls.push(mediaId);
      return result;
    },
  };
}

const verdict = (petId: number, name: string): PetIdentificationResult => ({
  pet_id: petId,
  caused_by: 'pet',
  pet_name: name,
  raw_response: name,
});

describe('RecognitionService', () => {
  let ctx: TestDbContext;
  let account: ProviderAccount;
  let disabledAccount: ProviderAccount;
  let device: Device;
  let petId: number;

  beforeEach(async () => {
    ctx = await createTestDb();
    account = await insertProviderAccount(ctx.db, {
      provider: 'inference',
      name: 'OpenRouter',
      config: { api_key: 'k', base_url: 'http://inference.local' },
    });
    disabledAccount = await insertProviderAccount(ctx.db, {
      provider: 'inference',
      name: 'Retired key',
      enabled: 0,
      config: { api_key: 'k', base_url: 'http://inference.local' },
    });
    device = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Hall fountain',
      type: 'water_fountain',
      external_id: 'wf-rec',
    });
    petId = (await insertPet(ctx.db, { name: 'Mochi' })).id;
  });

  afterEach(async () => {
    await destroyTestDb(ctx);
  });

  /** An event with one linked snapshot, the shape `media_ready` announces. */
  async function eventWithSnapshot(): Promise<{
    eventId: number;
    mediaId: number;
  }> {
    const event = await insertLitterboxEvent(ctx.db, {
      device_id: device.id,
      pet_id: null,
    });
    const media = await ctx.db
      .insertInto('media')
      .values({
        created_at: Math.floor(Date.now() / 1000),
        file_path: 'events/snap.jpg',
        mime_type: 'image/jpeg',
        file_size: 1,
        description: null,
        metadata: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await ctx.db
      .insertInto('media_link')
      .values({
        media_id: media.id,
        entity_type: 'event',
        entity_id: String(event.id),
        relation: 'snapshot',
        created_at: Math.floor(Date.now() / 1000),
      })
      .execute();
    return { eventId: event.id, mediaId: media.id };
  }

  const mediaReady = (eventId: number): DeviceMediaReadyEvent => ({
    deviceId: device.id,
    eventId,
    type: 'litterbox_use',
    timestamp: new Date(),
    mediaReady: true,
  });

  it('never calls the model for a device with no recognition', async () => {
    const { identify, calls } = fakeIdentify(verdict(petId, 'Mochi'));
    const service = new RecognitionService(ctx.db, new EventBus(), identify);
    const { eventId } = await eventWithSnapshot();

    await service.handleMediaReady(mediaReady(eventId));

    assert.deepEqual(calls, []);
  });

  it('never calls the model when auto-identify is off', async () => {
    // Off means off even though the attachment is otherwise complete — that is
    // the switch someone flips while tuning a prompt.
    await insertDeviceRecognition(ctx.db, device.id, account.id, {
      auto_identify: false,
    });
    const { identify, calls } = fakeIdentify(verdict(petId, 'Mochi'));
    const service = new RecognitionService(ctx.db, new EventBus(), identify);
    const { eventId } = await eventWithSnapshot();

    await service.handleMediaReady(mediaReady(eventId));

    assert.deepEqual(calls, []);
  });

  it('never calls the model when the account is switched off', async () => {
    await insertDeviceRecognition(ctx.db, device.id, disabledAccount.id);
    const { identify, calls } = fakeIdentify(verdict(petId, 'Mochi'));
    const service = new RecognitionService(ctx.db, new EventBus(), identify);
    const { eventId } = await eventWithSnapshot();

    await service.handleMediaReady(mediaReady(eventId));

    assert.deepEqual(calls, []);
  });

  it('identifies the snapshot and attributes the event', async () => {
    await insertDeviceRecognition(ctx.db, device.id, account.id);
    const { identify, calls } = fakeIdentify(verdict(petId, 'Mochi'));
    const service = new RecognitionService(ctx.db, new EventBus(), identify);
    const { eventId, mediaId } = await eventWithSnapshot();

    await service.handleMediaReady(mediaReady(eventId));

    assert.deepEqual(calls, [mediaId]);
    const row = await ctx.db
      .selectFrom('event')
      .select(['pet_id', 'caused_by', 'attributed_by'])
      .where('id', '=', eventId)
      .executeTakeFirstOrThrow();
    assert.deepEqual(row, {
      pet_id: petId,
      caused_by: 'pet',
      attributed_by: 'recognizer',
    });
  });

  it('runs off the subscription once initialized, and stops after shutdown', async () => {
    await insertDeviceRecognition(ctx.db, device.id, account.id);
    const bus = new EventBus();
    const calls: number[] = [];
    // Awaited inline so the fire-and-forget handler is observable without a
    // timer: the promise the bus never sees is captured here instead.
    let inFlight: Promise<void> = Promise.resolve();
    const service = new RecognitionService(ctx.db, bus, async (...args) => {
      calls.push(args[3]);
      return verdict(petId, 'Mochi');
    });
    const original = service.handleMediaReady.bind(service);
    service.handleMediaReady = (event) => {
      inFlight = original(event);
      return inFlight;
    };

    await service.initialize();
    const first = await eventWithSnapshot();
    bus.publish('device.event.media_ready', mediaReady(first.eventId));
    await inFlight;
    assert.equal(calls.length, 1);

    await service.shutdown();
    const second = await eventWithSnapshot();
    bus.publish('device.event.media_ready', mediaReady(second.eventId));
    await inFlight;
    assert.equal(calls.length, 1, 'shutdown must remove the listener');
  });

  it('reports why a manual test cannot run, and runs it when it can', async () => {
    const { identify } = fakeIdentify(verdict(petId, 'Mochi'));
    const service = new RecognitionService(ctx.db, new EventBus(), identify);

    assert.deepEqual(await service.testIdentify(device.id, 1), {
      ok: false,
      reason: 'no_recognition',
    });

    await insertDeviceRecognition(ctx.db, device.id, disabledAccount.id);
    assert.deepEqual(await service.testIdentify(device.id, 1), {
      ok: false,
      reason: 'account_disabled',
    });
  });

  it('runs a manual test even with auto-identify off', async () => {
    // Turning auto-identify off is exactly when someone wants to keep asking
    // by hand, so the diagnostic must not share that gate.
    await insertDeviceRecognition(ctx.db, device.id, account.id, {
      auto_identify: false,
    });
    const { identify, calls } = fakeIdentify(verdict(petId, 'Mochi'));
    const service = new RecognitionService(ctx.db, new EventBus(), identify);

    const outcome = await service.testIdentify(device.id, 42);

    assert.equal(outcome.ok, true);
    assert.deepEqual(calls, [42]);
  });

  it('loads the link with both blobs parsed', async () => {
    await insertDeviceRecognition(ctx.db, device.id, account.id, {
      model: 'vendor/model',
      ignored_pets: [7],
    });
    const service = new RecognitionService(ctx.db, new EventBus());

    const link = (await service.loadLink(device.id)) as RecognitionLink;
    assert.equal(link.config.model, 'vendor/model');
    assert.deepEqual(link.config.ignored_pets, [7]);
    assert.equal(link.accountConfig.base_url, 'http://inference.local');
    assert.equal(link.accountEnabled, true);
  });
});
