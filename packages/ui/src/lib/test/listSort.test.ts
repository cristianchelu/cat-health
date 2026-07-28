import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SORT_DIRECTIONS,
  sortDirectionSign,
  toggleSortDirection,
} from '../listSort.ts';

describe('sort direction', () => {
  it('offers exactly the two directions a toggle can hold', () => {
    assert.deepEqual([...SORT_DIRECTIONS], ['asc', 'desc']);
  });

  it('toggles back and forth', () => {
    assert.equal(toggleSortDirection('asc'), 'desc');
    assert.equal(toggleSortDirection('desc'), 'asc');
  });

  it('turns a direction into a comparator multiplier', () => {
    // Comparators are written ascending and multiplied, so there is exactly one
    // place in a sort that knows about direction.
    assert.equal(sortDirectionSign('asc'), 1);
    assert.equal(sortDirectionSign('desc'), -1);
  });
});
