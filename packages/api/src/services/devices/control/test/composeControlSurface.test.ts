import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { composeControlSurface } from '../composeControlSurface.ts';
import type { Acceptance, Settlement } from '../types.ts';

type Write = string;

function surfaceWith(
  encode: () => Write[],
  answer: (write: Write) => Acceptance<Settlement>,
) {
  const sent: Write[] = [];
  const surface = composeControlSurface<Write, null, Settlement>({
    state: () => null,
    actions: [
      {
        key: 'dev:button.go',
        descriptor: () => ({
          key: 'dev:button.go',
          label: { text: 'Go' },
          args: {},
          confirm: false,
          available: true,
          group: 'primary',
        }),
        encode,
      },
    ],
    channel: {
      submit: async (write) => {
        sent.push(write);
        return answer(write);
      },
    },
    confirmer: { settle: async (settlement) => settlement },
  });
  const go = () =>
    surface.submit({ kind: 'action', key: 'dev:button.go', args: {} });
  return { go, sent };
}

describe('composeControlSurface', () => {
  it('stops sending a command at the first refused write', async () => {
    const { go, sent } = surfaceWith(
      () => ['a', 'b', 'c'],
      (write) =>
        write === 'b'
          ? { status: 'failed', reason: 'rejected' }
          : { status: 'applied' },
    );

    const submission = await go();

    assert.deepEqual(submission, { status: 'failed', reason: 'rejected' });
    assert.deepEqual(sent, ['a', 'b']);
  });

  it('settles a command as failed when any of its pending writes fails', async () => {
    const { go } = surfaceWith(
      () => ['a', 'b'],
      (write) => ({
        status: 'pending',
        ref:
          write === 'a'
            ? { status: 'applied' }
            : { status: 'failed', reason: 'timeout' },
      }),
    );

    const submission = await go();
    assert.equal(submission.status, 'pending');
    const settlement =
      submission.status === 'pending'
        ? await submission.settle(new AbortController().signal)
        : null;

    assert.deepEqual(settlement, { status: 'failed', reason: 'timeout' });
  });

  it('turns a channel that throws into a failed submission', async () => {
    const { go } = surfaceWith(
      () => ['a'],
      () => {
        throw new Error('socket closed');
      },
    );

    assert.deepEqual(await go(), {
      status: 'failed',
      reason: 'unknown',
      message: 'socket closed',
    });
  });

  it('holds back the writes after a pending one until it settles', async () => {
    let release!: (settlement: Settlement) => void;
    const confirmation = new Promise<Settlement>((resolve) => {
      release = resolve;
    });
    const sent: Write[] = [];
    const surface = composeControlSurface<Write, null, Promise<Settlement>>({
      state: () => null,
      actions: [
        {
          key: 'dev:button.go',
          descriptor: () => ({
            key: 'dev:button.go',
            label: { text: 'Go' },
            args: {},
            confirm: false,
            available: true,
            group: 'primary',
          }),
          encode: () => ['device', 'record'],
        },
      ],
      channel: {
        submit: async (write) => {
          sent.push(write);
          return write === 'device'
            ? { status: 'pending', ref: confirmation }
            : { status: 'applied' };
        },
      },
      confirmer: { settle: (ref) => ref },
    });

    const submission = await surface.submit({
      kind: 'action',
      key: 'dev:button.go',
      args: {},
    });
    assert.deepEqual(sent, ['device']);
    assert.equal(submission.status, 'pending');
    if (submission.status !== 'pending') return;

    const settled = submission.settle(new AbortController().signal);
    release({ status: 'applied' });
    assert.deepEqual(await settled, { status: 'applied' });
    assert.deepEqual(sent, ['device', 'record']);
  });
});
