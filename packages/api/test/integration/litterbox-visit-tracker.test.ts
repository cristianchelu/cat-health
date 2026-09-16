import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { sql } from 'kysely';
import {
  decodeLitterboxRawData,
  decodeLitterboxVisitFrame,
  encodeLitterboxVisitFrame,
  type LitterboxVisitTrailer,
} from 'shared';

import { generateDemoVisit } from '../../src/scripts/seed-demo/generateVisit.ts';
import { EventBus } from '../../src/services/devices/EventBus.ts';
import { LitterboxVisitTracker } from '../../src/services/litterbox/LitterboxVisitTracker.ts';
import {
  insertDevice,
  insertPet,
  insertProviderAccount,
  insertWeightMeasurementEvent,
} from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

const FRAME_WAIT_MS = 60;
const VISIT_ID = 1_789_000_000;
const CAT_G = 4200;

const quiet = {
  ...console,
  log: () => {},
  warn: () => {},
} as Console;

/** The demo generator's urination trace, as tared grams at 10 Hz. */
function visitWeights(): number[] {
  const generated = generateDemoVisit(new Date(VISIT_ID * 1000), {
    eliminationType: 'urination',
    catWeightGrams: CAT_G,
    eliminationWeightGrams: 30,
    eliminationActiveSeconds: 12,
    straining: false,
    knownCatWeightsGrams: [CAT_G],
  });
  const decoded = decodeLitterboxRawData(generated.rawData);
  assert.ok(decoded);
  // The generator stops on the exit ramp; settle on the waste left behind.
  return [...decoded.weights, ...Array.from({ length: 20 }, () => 30)];
}

function trailerFor(
  weights: number[],
  overrides: Partial<LitterboxVisitTrailer> = {},
): LitterboxVisitTrailer {
  const duration = Math.round(weights.length / 10);
  return {
    id: VISIT_ID,
    ended: VISIT_ID + duration,
    clock_valid: true,
    duration,
    samples: weights.length,
    stored: weights.length,
    long_enough: true,
    continued: false,
    drops: [],
    drops_overflow: false,
    zones: [[0, 0, 1]],
    visit: {
      cat_weight: CAT_G,
      waste_weight: 30,
      type: 'urination',
      cat: 0,
      periods: [
        ['entering', 0, 24, -1],
        ['eliminating', 25, 145, 2.5],
      ],
    },
    box: {
      kind: 'none',
      level: 0,
      added: 0,
      box: 0,
      zero_valid: false,
      zero: 0,
      absent: false,
      scooped: false,
    },
    config: {
      cat_weights: [CAT_G / 1000, 0, 0, 0, 0],
      sd_threshold: 4,
      tare: 1.5,
      auto_tare: 0,
      spike: 0.5,
      vibration: 0.02,
      activity_off: 4,
      timeout: 120,
      box: {
        box_g: 1500,
        off_tol: 100,
        empty_tol: 150,
        lift: 1000,
        return_tol: 100,
        top_up_min: 300,
        scoop_min: 20,
        scoop_min_s: 5,
        settle_s: 30,
      },
    },
    fw: { project: 'CristianChelu.LitterboxMonitor', version: 'esp32s3.hx711' },
    ...overrides,
  };
}

/** A device frame whose codes are the weights rounded to the gram. */
function frameFor(
  weights: number[],
  overrides: Partial<LitterboxVisitTrailer> = {},
) {
  const bytes = encodeLitterboxVisitFrame(
    weights.map((w) => Math.round(w)),
    trailerFor(weights, overrides),
  );
  const decoded = decodeLitterboxVisitFrame(bytes);
  assert.ok(decoded.ok);
  return { bytes, frame: decoded.frame };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('LitterboxVisitTracker', () => {
  let ctx: TestDbContext;
  let deviceId: number;
  let petId: number;
  let tracker: LitterboxVisitTracker;
  const eventBus = new EventBus();
  const weights = visitWeights();

  const deviceEvents = () =>
    ctx.db
      .selectFrom('event')
      .selectAll()
      .where('device_id', '=', deviceId)
      .where('parent_event_id', 'is', null)
      .orderBy('timestamp', 'asc')
      .execute();

  /** A native session that mirrors the frame's visit at ~7 Hz. */
  const runNativeSession = (startMs: number) => {
    tracker.activityChanged(true, new Date(startMs));
    weights.forEach((w, i) => {
      if (i % 3 === 2) return;
      tracker.sample(w, new Date(startMs + i * 100));
    });
    tracker.activityChanged(
      false,
      new Date(startMs + weights.length * 100 + 4000),
    );
  };

  before(async () => {
    ctx = await createTestDb();
    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
    });
    deviceId = (await insertDevice(ctx.db, { provider_account_id: account.id }))
      .id;
    petId = (await insertPet(ctx.db)).id;
    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: petId,
      weight: CAT_G,
      timestamp: new Date((VISIT_ID - 86_400) * 1000),
    });
  });

  beforeEach(async () => {
    tracker?.dispose();
    await ctx.db
      .deleteFrom('event')
      .where('device_id', '=', deviceId)
      .execute();
    tracker = new LitterboxVisitTracker(
      deviceId,
      {
        db: ctx.db,
        eventBus,
        logger: quiet,
        readCounters: () => ({ wasteWeightG: 55, visitsSinceScoop: 2 }),
      },
      { frameWaitMs: FRAME_WAIT_MS },
    );
  });

  after(async () => {
    tracker.dispose();
    await destroyTestDb(ctx);
  });

  it('scores the native session when no device record arrives in time', async () => {
    runNativeSession(VISIT_ID * 1000 + 500);
    assert.equal((await deviceEvents()).length, 0);
    await sleep(FRAME_WAIT_MS * 3);

    const events = await deviceEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].data.type, 'litterbox_use');
    assert.equal(events[0].pet_id, petId);
    assert.equal(events[0].raw_data?.[0], 2);
    assert.equal(
      events[0].data.type === 'litterbox_use' && events[0].data.device_verdict,
      undefined,
    );
  });

  it('prefers the device record over native scoring', async () => {
    runNativeSession(VISIT_ID * 1000 + 500);
    const { bytes, frame } = frameFor(weights);
    assert.equal(await tracker.ingestFrame(frame, bytes), 'recorded_visit');
    await sleep(FRAME_WAIT_MS * 3);

    const events = await deviceEvents();
    assert.equal(events.length, 1);
    const [visit] = events;
    assert.equal(visit.timestamp.getTime(), VISIT_ID * 1000);
    assert.equal(visit.pet_id, petId);
    assert.equal(visit.data.type, 'litterbox_use');
    if (visit.data.type !== 'litterbox_use') return;
    assert.equal(visit.data.elimination_type, 'urination');
    assert.equal(visit.data.elimination_weight, 30);
    assert.equal(visit.data.sample_rate_hz, 10);
    assert.deepEqual(visit.data.device_verdict, {
      visit_id: VISIT_ID,
      elimination_type: 'urination',
      cat_index: 0,
      cat_weight: CAT_G,
      waste_weight: 30,
      segments: [
        { state: 'entering', start: 0, end: 24 },
        {
          state: 'eliminating',
          start: 25,
          end: 145,
          elimination_type: 'urination',
        },
      ],
      firmware: 'CristianChelu.LitterboxMonitor esp32s3.hx711',
    });

    const raw = decodeLitterboxRawData(visit.raw_data!);
    assert.equal(raw?.version, 3);
    assert.equal(raw?.context.wasteWeight, 55);
    assert.equal(raw?.deviceVisit?.trailer.id, VISIT_ID);
    assert.equal(raw?.weights.length, weights.length);
  });

  it('records the visit from a record alone, with no native session', async () => {
    const { bytes, frame } = frameFor(weights);
    assert.equal(await tracker.ingestFrame(frame, bytes), 'recorded_visit');
    assert.equal((await deviceEvents()).length, 1);
  });

  it('attaches a late record to the natively scored visit', async () => {
    runNativeSession(VISIT_ID * 1000 + 500);
    await sleep(FRAME_WAIT_MS * 3);
    const before = await deviceEvents();
    assert.equal(before.length, 1);

    const { bytes, frame } = frameFor(weights);
    assert.equal(
      await tracker.ingestFrame(frame, bytes),
      'attached_to_existing',
    );

    const events = await deviceEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].id, before[0].id);
    assert.equal(events[0].raw_data?.[0], 3);
    assert.equal(
      events[0].data.type === 'litterbox_use' &&
        events[0].data.device_verdict?.visit_id,
      VISIT_ID,
    );
  });

  it('a record arriving mid native scoring attaches instead of doubling', async () => {
    runNativeSession(VISIT_ID * 1000 + 500);
    await sleep(FRAME_WAIT_MS + 20);
    const { bytes, frame } = frameFor(weights);
    assert.equal(
      await tracker.ingestFrame(frame, bytes),
      'attached_to_existing',
    );
    assert.equal((await deviceEvents()).length, 1);
  });

  it('ignores a record it has already stored', async () => {
    const { bytes, frame } = frameFor(weights);
    await tracker.ingestFrame(frame, bytes);
    assert.equal(await tracker.ingestFrame(frame, bytes), 'duplicate');
    assert.equal((await deviceEvents()).length, 1);
  });

  it('records box maintenance from the device box verdict', async () => {
    const scoop = frameFor(
      weights.map((w) => w - 100),
      {
        visit: null,
        box: {
          kind: 'scoop',
          level: 3000,
          added: 0,
          box: 1500,
          zero_valid: true,
          zero: 2,
          absent: false,
          scooped: true,
        },
      },
    );
    assert.equal(
      await tracker.ingestFrame(scoop.frame, scoop.bytes),
      'recorded_maintenance',
    );

    const topUp = frameFor(weights, {
      id: VISIT_ID + 3600,
      ended: VISIT_ID + 3660,
      visit: null,
      box: {
        kind: 'top_up',
        level: 3400,
        added: 412.4,
        box: 1500,
        zero_valid: false,
        zero: 0,
        absent: false,
        scooped: false,
      },
    });
    assert.equal(
      await tracker.ingestFrame(topUp.frame, topUp.bytes),
      'recorded_maintenance',
    );

    const events = await deviceEvents();
    assert.deepEqual(
      events.map((event) => event.data),
      [
        { type: 'litterbox_maintenance', maintenance_type: 'scoop' },
        {
          type: 'litterbox_maintenance',
          maintenance_type: 'litter_addition',
          litter_amount: 412,
        },
      ],
    );
  });

  it('leaves a short, eventless record alone', async () => {
    const { bytes, frame } = frameFor(weights.slice(0, 40), {
      visit: null,
      long_enough: false,
    });
    assert.equal(await tracker.ingestFrame(frame, bytes), 'nothing_to_record');
    assert.equal((await deviceEvents()).length, 0);
  });

  it('a continued record supplies the waste of the visit it continues', async () => {
    // The cat sat through the device timeout: the record closes with it
    // still on the scale.
    const sitting = frameFor([...weights.slice(0, 150), CAT_G, CAT_G, CAT_G]);
    assert.equal(
      await tracker.ingestFrame(sitting.frame, sitting.bytes),
      'recorded_visit',
    );
    let [visit] = await deviceEvents();
    assert.equal(
      visit.data.type === 'litterbox_use' && visit.data.elimination_weight,
      0,
    );

    const leaving = frameFor([CAT_G, CAT_G, 2000, 400, 31, 31, 31], {
      id: VISIT_ID + 130,
      ended: VISIT_ID + 145,
      duration: 15,
      continued: true,
      visit: null,
    });
    assert.equal(
      await tracker.ingestFrame(leaving.frame, leaving.bytes),
      'patched_continued',
    );

    const events = await deviceEvents();
    assert.equal(events.length, 1);
    [visit] = events;
    assert.equal(
      visit.data.type === 'litterbox_use' && visit.data.elimination_weight,
      31,
    );
  });

  it('cancels native scoring only for the session the record covers', async () => {
    // An old record, replayed from the device journal, must not silence a
    // session that started an hour later.
    runNativeSession((VISIT_ID + 3600) * 1000);
    const stale = frameFor(weights);
    await tracker.ingestFrame(stale.frame, stale.bytes);
    await sleep(FRAME_WAIT_MS * 3);

    const events = await deviceEvents();
    assert.equal(events.length, 2);
    assert.deepEqual(
      events.map((event) => event.timestamp.getTime()),
      [VISIT_ID * 1000, (VISIT_ID + 3600) * 1000],
    );
  });

  it('keeps the weight measurement it derives under the visit', async () => {
    const { bytes, frame } = frameFor(weights);
    await tracker.ingestFrame(frame, bytes);
    const children = await ctx.db
      .selectFrom('event')
      .select(['pet_id', 'data'])
      .where('device_id', '=', deviceId)
      .where('parent_event_id', 'is not', null)
      .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
      .execute();
    assert.equal(children.length, 1);
    assert.equal(children[0].pet_id, petId);
  });
});
