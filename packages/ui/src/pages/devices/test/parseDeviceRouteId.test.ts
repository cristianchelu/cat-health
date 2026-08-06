import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseDeviceRouteId } from '../parseDeviceRouteId.ts';

describe('parseDeviceRouteId', () => {
  it('accepts positive integer ids', () => {
    assert.equal(parseDeviceRouteId('1'), 1);
    assert.equal(parseDeviceRouteId('99999'), 99999);
  });

  it('rejects missing, non-numeric, and non-positive ids', () => {
    assert.equal(parseDeviceRouteId(undefined), null);
    assert.equal(parseDeviceRouteId(''), null);
    assert.equal(parseDeviceRouteId('abc'), null);
    assert.equal(parseDeviceRouteId('0'), null);
    assert.equal(parseDeviceRouteId('-3'), null);
    assert.equal(parseDeviceRouteId('1.5'), null);
  });
});
