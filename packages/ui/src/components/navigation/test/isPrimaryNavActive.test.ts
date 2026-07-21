import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPrimaryNavActive } from '../isPrimaryNavActive.ts';

describe('isPrimaryNavActive', () => {
  it('marks Overview active on / and /overview children', () => {
    assert.equal(isPrimaryNavActive('/', '/'), true);
    assert.equal(isPrimaryNavActive('/', '/overview/litterbox'), true);
  });

  it('does not mark Overview active on unrelated routes', () => {
    assert.equal(isPrimaryNavActive('/', '/settings'), false);
    assert.equal(isPrimaryNavActive('/', '/devices/1'), false);
    assert.equal(isPrimaryNavActive('/', '/health'), false);
  });

  it('uses prefix matching for non-Overview items', () => {
    assert.equal(isPrimaryNavActive('/settings', '/settings'), true);
    assert.equal(isPrimaryNavActive('/settings', '/settings/pets/1'), true);
    assert.equal(isPrimaryNavActive('/devices', '/devices/1'), true);
    assert.equal(isPrimaryNavActive('/health', '/health'), true);
  });

  it('does not invent active state across sections', () => {
    assert.equal(isPrimaryNavActive('/settings', '/overview/litterbox'), false);
    assert.equal(isPrimaryNavActive('/devices', '/settings'), false);
    assert.equal(isPrimaryNavActive('/health', '/devices/1'), false);
  });
});
