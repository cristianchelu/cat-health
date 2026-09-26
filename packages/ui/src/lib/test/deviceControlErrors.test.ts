import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AxiosError, AxiosHeaders } from 'axios';
import type { TFunction } from 'i18next';

import { deviceWriteErrorMessage } from '../deviceControlErrors';

const t = ((key: string) => `t:${key}`) as unknown as TFunction;

const httpError = (data: unknown) =>
  new AxiosError('failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status: 504,
    statusText: 'Gateway Timeout',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

describe('deviceWriteErrorMessage', () => {
  it('words a failure by the reason the API names', () => {
    const error = httpError({ message: 'raw', reason: 'timeout' });
    assert.equal(
      deviceWriteErrorMessage(error, t, 'fallback'),
      't:devices.controls.failed.timeout',
    );
  });

  it('falls back to the API message when there is no known reason', () => {
    const error = httpError({ message: 'Device 3 is disabled' });
    assert.equal(
      deviceWriteErrorMessage(error, t, 'fallback'),
      'Device 3 is disabled',
    );
  });
});
