import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ControlRequestStatus } from '../constants.ts';
import {
  createFeederControlSurface,
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
) {
  const puts: SurePetControlWrite[] = [];
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
  };
  const surface = createFeederControlSurface(() => control, writer, FAST);
  return { surface, puts, queue, refreshes: () => refreshes };
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
