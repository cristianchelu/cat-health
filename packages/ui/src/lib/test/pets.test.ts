import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPetActive, offerablePets } from '../pets.ts';

const open = { id: 1, closed_at: null };
const closed = { id: 2, closed_at: '2026-10-20T09:00:00.000Z' };

describe('pet lifecycle helpers', () => {
  it('treats a closed profile as inactive', () => {
    assert.equal(isPetActive(open), true);
    assert.equal(isPetActive(closed), false);
  });

  it('offers active pets plus a closed one that is already chosen', () => {
    assert.deepEqual(offerablePets([open, closed]), [open]);
    assert.deepEqual(offerablePets([open, closed], [2]), [open, closed]);
    assert.deepEqual(offerablePets([open, closed], [null]), [open]);
  });
});
