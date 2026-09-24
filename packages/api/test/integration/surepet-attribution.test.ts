import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { EventBus } from '../../src/services/devices/EventBus.ts';
import { DevicePresence } from '../../src/services/devices/DevicePresence.ts';
import { MediaManager } from '../../src/services/media/MediaManager.ts';
import { recordDeviceEvent } from '../../src/services/events/recordDeviceEvent.ts';
import { SurePetAccountManager } from '../../src/services/devices/providers/surepet/SurePetAccountManager.ts';
import { WeightContext } from '../../src/services/devices/providers/surepet/constants.ts';
import type {
  NormalizedFeedingDatapoint,
  NormalizedServedDatapoint,
} from '../../src/services/devices/providers/surepet/types.ts';
import type { ProviderDeps } from '../../src/services/devices/types.ts';
import {
  insertDevice,
  insertPet,
  insertProviderAccount,
} from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

const CLOUD_DEVICE_ID = 916520;
const TAG_ID = 3662632;
const TOKEN = `stored.${'x'.repeat(340)}`;

function buildDeps(ctx: TestDbContext): ProviderDeps {
  const eventBus = new EventBus();
  const db = ctx.db;
  return {
    db,
    eventBus,
    mediaManager: new MediaManager(db),
    directory: {
      instantiateController: async () => undefined,
      getLinkedCamera: async () => undefined,
    },
    presence: new DevicePresence({
      db,
      eventBus,
      recordDeviceEvent: (input) => recordDeviceEvent({ db, eventBus }, input),
    }),
    logger: console,
  };
}

/** The private ingest surface, reached the way the poll and backfill reach it. */
interface ManagerInternals {
  ingestFeedingDatapoints(d: NormalizedFeedingDatapoint[]): Promise<unknown>;
  ingestServedDatapoints(d: NormalizedServedDatapoint[]): Promise<void>;
  backfillSurePetFeedingEventPetIds(): Promise<void>;
}

function meal(
  overrides: Partial<NormalizedFeedingDatapoint> = {},
): NormalizedFeedingDatapoint {
  return {
    from: new Date('2026-09-20T08:00:00Z'),
    amount_g: 5,
    tag_id: TAG_ID,
    device_id: CLOUD_DEVICE_ID,
    timeline_entry_id: 1000,
    source_id: 'timeline-weight:1000:1',
    bowl_index: 0,
    cause: 'pet',
    weight_context: WeightContext.PET_CLOSED,
    ...overrides,
  };
}

/**
 * The event table's CHECK allows a `pet_id` only beside `caused_by = 'pet'`.
 * Every path that names a pet after the insert has to respect it, and none may
 * turn a tag on an intruder or a dubious record into an identification.
 */
describe('SurePet attribution', () => {
  const contexts: TestDbContext[] = [];

  afterEach(async () => {
    while (contexts.length) {
      const ctx = contexts.pop();
      if (ctx) await destroyTestDb(ctx);
    }
  });

  const setup = async (options: { linked: boolean }) => {
    const ctx = await createTestDb();
    contexts.push(ctx);
    const pet = await insertPet(ctx.db);
    const link = {
      external_pet_id: '779258',
      pet_id: pet.id,
      metadata: { tag_id: TAG_ID },
    };
    const account = await insertProviderAccount(ctx.db, {
      provider: 'surepet',
      name: 'Casa Whiskers',
      config: {
        email: 'you@example.com',
        password: 'pw',
        pet_links: options.linked ? [link] : [],
      },
      runtime_state: { device_id: 'install', token: TOKEN, household_id: 42 },
    });
    const device = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      external_id: String(CLOUD_DEVICE_ID),
      type: 'feeder',
      config: {},
    });
    const manager = new SurePetAccountManager(account, buildDeps(ctx));
    const internals = manager as unknown as ManagerInternals;

    const linkTag = () =>
      ctx.db
        .updateTable('provider_account')
        .set({
          config: {
            email: 'you@example.com',
            password: 'pw',
            pet_links: [link],
          },
        })
        .where('id', '=', account.id)
        .execute();

    const rows = () =>
      ctx.db
        .selectFrom('event')
        .select(['id', 'pet_id', 'caused_by', 'attributed_by', 'data'])
        .where('device_id', '=', device.id)
        .orderBy('id')
        .execute();

    return { ctx, pet, internals, linkTag, rows };
  };

  it('never names a pet on a dubious reading, however often it is seen', async () => {
    const { internals, rows } = await setup({ linked: true });
    const dubious = meal({
      cause: 'unknown',
      weight_context: WeightContext.DUBIOUS_CLOSED,
    });

    await internals.ingestFeedingDatapoints([dubious]);
    // Seen again by the backfill walk, and again on the next start.
    await internals.ingestFeedingDatapoints([dubious]);
    await internals.backfillSurePetFeedingEventPetIds();

    const [row, ...rest] = await rows();
    assert.equal(rest.length, 0);
    assert.equal(row?.pet_id, null);
    assert.equal(row?.caused_by, 'unknown');
  });

  it('keeps an intruder off our pet even when its tag is linked', async () => {
    const { internals, rows } = await setup({ linked: true });

    await internals.ingestFeedingDatapoints([
      meal({
        cause: 'other_animal',
        weight_context: WeightContext.INTRUDER_CLOSED,
      }),
    ]);
    await internals.backfillSurePetFeedingEventPetIds();

    for (const row of await rows()) {
      assert.equal(row.pet_id, null);
      assert.equal(row.caused_by, 'other_animal');
    }
  });

  it('names the pet once its tag is linked, writing the whole decision', async () => {
    const { pet, internals, linkTag, rows } = await setup({ linked: false });

    await internals.ingestFeedingDatapoints([meal()]);
    const [before] = await rows();
    assert.equal(before?.pet_id, null);

    await linkTag();
    await internals.backfillSurePetFeedingEventPetIds();

    const [after] = await rows();
    assert.equal(after?.pet_id, pet.id);
    assert.equal(after?.caused_by, 'pet');
    assert.equal(after?.attributed_by, 'microchip');
  });

  it('can name the pet on a legacy row stored as unknown', async () => {
    // Rows from before `caused_by` was passed explicitly were `unknown` when
    // unlinked; setting only `pet_id` on them broke the CHECK.
    const { pet, ctx, internals, linkTag, rows } = await setup({
      linked: false,
    });
    await internals.ingestFeedingDatapoints([
      meal({ cause: undefined, weight_context: undefined }),
    ]);
    const [stored] = await rows();
    await ctx.db
      .updateTable('event')
      .set({ caused_by: 'unknown', attributed_by: null })
      .where('id', '=', stored!.id)
      .execute();

    await linkTag();
    await internals.backfillSurePetFeedingEventPetIds();

    const [after] = await rows();
    assert.equal(after?.pet_id, pet.id);
    assert.equal(after?.caused_by, 'pet');
  });

  it('records a serving as a person’s doing', async () => {
    const { internals, rows } = await setup({ linked: true });

    await internals.ingestServedDatapoints([
      {
        from: new Date('2026-09-20T07:00:00Z'),
        amount_g: 63,
        device_id: CLOUD_DEVICE_ID,
        bowl_index: 0,
        level_before_g: 0,
        level_after_g: 63,
        timeline_entry_id: 999,
        source_id: 'timeline-served:999:1',
      },
    ]);

    const [row] = await rows();
    assert.equal(row?.caused_by, 'human');
    assert.equal(row?.pet_id, null);
    assert.equal(row?.attributed_by, null);
  });
});
