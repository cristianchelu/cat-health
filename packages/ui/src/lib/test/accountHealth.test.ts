import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProviderAccountHealthDTO } from 'shared';

import {
  accountHealthPollMs,
  accountHealthPresentation,
  hasAccountProblem,
} from '../accountHealth.ts';

const NOW = Date.parse('2026-10-06T12:00:00.000Z');

function unavailable(nextRetryInMs: number): ProviderAccountHealthDTO {
  return {
    state: 'unavailable',
    since: new Date(NOW - 60_000).toISOString(),
    next_retry_at: new Date(NOW + nextRetryInMs).toISOString(),
    attempts: 3,
  };
}

describe('hasAccountProblem', () => {
  it('is false for a healthy or switched-off account', () => {
    assert.equal(hasAccountProblem('ok'), false);
    assert.equal(hasAccountProblem(null), false);
    assert.equal(hasAccountProblem(undefined), false);
  });

  it('is true while the account cannot serve its devices', () => {
    assert.equal(hasAccountProblem('starting'), true);
    assert.equal(hasAccountProblem('unavailable'), true);
    assert.equal(hasAccountProblem('failed'), true);
  });
});

describe('accountHealthPresentation', () => {
  it('says nothing for a healthy or switched-off account', () => {
    assert.equal(accountHealthPresentation('ok'), null);
    assert.equal(accountHealthPresentation(null), null);
  });

  it('warns while the server is retrying', () => {
    assert.equal(accountHealthPresentation('unavailable')?.pill, 'warn');
    assert.equal(accountHealthPresentation('unavailable')?.tone, 'warning');
  });

  it('errors once the account waits on the user', () => {
    assert.equal(accountHealthPresentation('failed')?.pill, 'error');
    assert.equal(accountHealthPresentation('failed')?.tone, 'error');
  });
});

describe('accountHealthPollMs', () => {
  it('does not poll an account that only a user action will move', () => {
    assert.equal(accountHealthPollMs(null, NOW), false);
    assert.equal(
      accountHealthPollMs({ state: 'ok', since: '2026-10-06T00:00:00Z' }, NOW),
      false,
    );
    assert.equal(
      accountHealthPollMs(
        { state: 'failed', since: '2026-10-06T00:00:00Z', reason: 'no' },
        NOW,
      ),
      false,
    );
  });

  it('polls quickly while an account starts', () => {
    assert.equal(
      accountHealthPollMs(
        { state: 'starting', since: '2026-10-06T00:00:00Z' },
        NOW,
      ),
      2_000,
    );
  });

  it('looks again just after the next scheduled attempt', () => {
    assert.equal(accountHealthPollMs(unavailable(20_000), NOW), 21_000);
  });

  it('keeps between five seconds and a minute', () => {
    assert.equal(accountHealthPollMs(unavailable(0), NOW), 5_000);
    assert.equal(accountHealthPollMs(unavailable(3_600_000), NOW), 60_000);
  });
});
