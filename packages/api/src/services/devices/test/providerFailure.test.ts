import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeProviderError,
  retryAfterMs,
  retryDelay,
} from '../providerFailure.ts';

const POLICY = { baseMs: 30_000, maxMs: 3_600_000 };
const MID = () => 0.5;

describe('retryDelay', () => {
  it('doubles from the base until the cap', () => {
    assert.equal(retryDelay(POLICY, 0, undefined, MID), 30_000);
    assert.equal(retryDelay(POLICY, 1, undefined, MID), 60_000);
    assert.equal(retryDelay(POLICY, 6, undefined, MID), 1_920_000);
    assert.equal(retryDelay(POLICY, 7, undefined, MID), 3_600_000);
    assert.equal(retryDelay(POLICY, 40, undefined, MID), 3_600_000);
  });

  it('jitters twenty percent either side of the nominal delay', () => {
    assert.equal(
      retryDelay(POLICY, 7, undefined, () => 0),
      2_880_000,
    );
    assert.equal(
      retryDelay(POLICY, 7, undefined, () => 1),
      4_320_000,
    );
  });

  it('never retries before a server-requested wait', () => {
    assert.equal(
      retryDelay(POLICY, 0, 120_000, () => 0),
      120_000,
    );
    assert.equal(
      retryDelay(POLICY, 0, 120_000, () => 1),
      144_000,
    );
  });

  it('keeps the nominal delay when the server asks for less', () => {
    assert.equal(
      retryDelay(POLICY, 3, 1_000, () => 0),
      240_000,
    );
  });
});

describe('retryAfterMs', () => {
  it('reads a wait carried on the error', () => {
    const error = Object.assign(new Error('slow down'), {
      retryAfterMs: 5_000,
    });
    assert.equal(retryAfterMs(error), 5_000);
  });

  it('ignores errors without one', () => {
    assert.equal(retryAfterMs(new Error('x')), undefined);
    assert.equal(retryAfterMs(undefined), undefined);
  });
});

describe('describeProviderError', () => {
  it('names the network cause behind a bare fetch failure', () => {
    const cause = new Error(
      'getaddrinfo EAI_AGAIN app-api.production.surehub.io',
    );
    const error = new TypeError('fetch failed', { cause });
    assert.equal(
      describeProviderError(error),
      'fetch failed (getaddrinfo EAI_AGAIN app-api.production.surehub.io)',
    );
  });

  it('uses the message alone when there is no cause', () => {
    assert.equal(describeProviderError(new Error('boom')), 'boom');
    assert.equal(describeProviderError('boom'), 'boom');
  });
});
