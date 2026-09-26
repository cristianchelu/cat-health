import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ControlRequestStatus } from '../constants.ts';
import {
  createFeederControlSurface,
  type FoodGroup,
  type SurePetControlWriter,
} from '../feederControls.ts';
import type {
  SurePetControlRequest,
  SurePetControlWrite,
  SurePetDeviceControlPayload,
} from '../types.ts';

const FAST = { intervalMs: 1, timeoutMs: 200 };

/**
 * A feeder whose cloud answers each write from `answer`, and whose status
 * queue is whatever `queue` holds when polled.
 */
function makeFeeder(
  control: SurePetDeviceControlPayload,
  answer: SurePetControlRequest | null,
  options: { config?: unknown; foods?: Record<number, FoodGroup> } = {},
) {
  const puts: SurePetControlWrite[] = [];
  const saved: unknown[] = [];
  let refreshes = 0;
  const queue: SurePetControlRequest[] = [];
  const writer: SurePetControlWriter = {
    put: async (write) => {
      puts.push(write);
      return answer;
    },
    status: async () => [...queue],
    refresh: async () => {
      refreshes += 1;
    },
    foodGroups: async (ids) =>
      new Map(ids.map((id) => [id, options.foods?.[id] ?? 'unknown'])),
    saveFoodCompartments: async (rows) => {
      saved.push(rows);
    },
  };
  const surface = createFeederControlSurface(
    () => ({ control, config: options.config ?? {} }),
    writer,
    FAST,
  );
  return { surface, puts, saved, queue, refreshes: () => refreshes };
}

const setDelay = (value: string) =>
  ({ kind: 'setting', key: 'lid_close_delay', value }) as const;

describe('SureFeed controls', () => {
  it('reads the lid close delay as a named speed', () => {
    const { surface } = makeFeeder({ lid: { close_delay: 4 } }, null);
    assert.equal(surface.readSettings().get('lid_close_delay'), 'normal');
  });

  it('reads an unrecognised delay as unknown rather than guessing', () => {
    const { surface } = makeFeeder({ lid: { close_delay: 7 } }, null);
    assert.equal(surface.readSettings().get('lid_close_delay'), null);
  });

  it('sends the whole lid object with only the delay changed', async () => {
    const lid = { close_delay: 4, some_other_field: 1 } as never;
    const { surface, puts } = makeFeeder(
      { lid },
      { request_id: 'r1', status_id: ControlRequestStatus.SUCCESS },
    );

    await surface.submit(setDelay('slow'));

    assert.deepEqual(puts, [{ lid: { close_delay: 20, some_other_field: 1 } }]);
  });

  it('counts a write the cloud already applied as applied', async () => {
    const { surface, refreshes } = makeFeeder(
      { lid: { close_delay: 4 } },
      { request_id: 'r1', status_id: ControlRequestStatus.NO_CHANGE },
    );

    assert.deepEqual(await surface.submit(setDelay('normal')), {
      status: 'applied',
    });
    assert.equal(refreshes(), 1);
  });

  it('follows a pending write until it leaves the queue', async () => {
    const { surface, queue, refreshes } = makeFeeder(
      { lid: { close_delay: 4 } },
      { request_id: 42, status_id: ControlRequestStatus.PENDING },
    );
    queue.push({ request_id: 42, status: ControlRequestStatus.PENDING });

    const submission = await surface.submit(setDelay('fast'));
    assert.equal(submission.status, 'pending');
    if (submission.status !== 'pending') return;

    const settled = submission.settle(new AbortController().signal);
    queue.length = 0;

    assert.deepEqual(await settled, { status: 'applied' });
    assert.equal(refreshes(), 1);
  });

  it('fails a write the cloud answered without a queued request', async () => {
    const { surface } = makeFeeder({ lid: { close_delay: 4 } }, null);

    const submission = await surface.submit(setDelay('slow'));

    assert.equal(
      submission.status === 'failed' && submission.reason,
      'unknown',
    );
  });

  it('reports a request the feeder never picked up as a timeout', async () => {
    const { surface, queue } = makeFeeder(
      { lid: { close_delay: 4 } },
      { request_id: 'r9', status_id: ControlRequestStatus.PENDING },
    );
    queue.push({
      request_id: 'r9',
      status_id: ControlRequestStatus.DEVICE_TIMEOUT,
    });

    const submission = await surface.submit(setDelay('fast'));
    const settlement =
      submission.status === 'pending'
        ? await submission.settle(new AbortController().signal)
        : null;

    assert.deepEqual(settlement, { status: 'failed', reason: 'timeout' });
  });
});

describe('SureFeed bowls', () => {
  const FOODS: Record<number, FoodGroup> = { 1: 'wet', 2: 'dry', 3: 'treat' };
  const split = {
    type: 4,
    settings: [
      { food_type: 1, target: 40 },
      { food_type: 2, target: 25 },
    ],
  };
  const setBowls = (value: unknown) =>
    ({ kind: 'setting', key: 'bowls', value }) as const;

  it('reads the layout, each bowl food from our record, and its portion', () => {
    const { surface } = makeFeeder({ bowls: split }, null, {
      config: {
        food_compartments: [
          { compartment: '0', food_id: 1 },
          { compartment: '1', food_id: 2 },
        ],
      },
    });

    assert.deepEqual(surface.readSettings().get('bowls'), {
      layout: 'split',
      compartments: [
        { food: 1, portion: 40 },
        { food: 2, portion: 25 },
      ],
    });
  });

  it('refuses a bowl without food and a portion under ten grams', () => {
    const { surface } = makeFeeder({ bowls: split }, null);
    const noFood = {
      layout: 'single',
      compartments: [{ food: null, portion: 30 }],
    };
    const tiny = { layout: 'single', compartments: [{ food: 2, portion: 5 }] };

    assert.ok(surface.validate(setBowls(noFood)));
    assert.ok(surface.validate(setBowls(tiny)));
    assert.equal(
      surface.validate(
        setBowls({ layout: 'single', compartments: [{ food: 2, portion: 0 }] }),
      ),
      null,
    );
  });

  it('sets the feeder first and records the foods only once it confirms', async () => {
    const { surface, puts, saved, queue } = makeFeeder(
      { bowls: { type: 1, settings: [{ food_type: 2, target: 60 }] } },
      { request_id: 7, status_id: ControlRequestStatus.PENDING },
      { foods: FOODS },
    );
    queue.push({ request_id: 7, status_id: ControlRequestStatus.PENDING });

    const submission = await surface.submit(
      setBowls({
        layout: 'split',
        compartments: [
          { food: 1, portion: 40 },
          { food: 2, portion: 25 },
        ],
      }),
    );

    assert.deepEqual(puts, [{ bowls: split }]);
    assert.deepEqual(saved, []);
    assert.equal(submission.status, 'pending');
    if (submission.status !== 'pending') return;

    const settled = submission.settle(new AbortController().signal);
    queue.length = 0;
    assert.deepEqual(await settled, { status: 'applied' });
    assert.deepEqual(saved, [
      [
        { compartment: '0', food_id: 1 },
        { compartment: '1', food_id: 2 },
      ],
    ]);
  });

  it('only records the foods when the feeder already matches', async () => {
    const { surface, puts, saved } = makeFeeder({ bowls: split }, null, {
      foods: { ...FOODS, 4: 'wet' },
    });

    const submission = await surface.submit(
      setBowls({
        layout: 'split',
        compartments: [
          { food: 4, portion: 40 },
          { food: 2, portion: 25 },
        ],
      }),
    );

    assert.deepEqual(submission, { status: 'applied' });
    assert.deepEqual(puts, []);
    assert.equal(saved.length, 1);
  });

  it('refuses a food that is neither wet nor dry', async () => {
    const { surface, puts } = makeFeeder({ bowls: split }, null, {
      foods: FOODS,
    });

    const submission = await surface.submit(
      setBowls({ layout: 'single', compartments: [{ food: 3, portion: 20 }] }),
    );

    assert.equal(submission.status, 'failed');
    assert.deepEqual(puts, []);
  });
});
