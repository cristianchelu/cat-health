import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPath } from '../path.ts';

describe('createPath', () => {
  it('draws nothing for an empty signal', () => {
    assert.equal(createPath([], 100, 50, 0, 10), '');
  });

  it('puts a single sample at the left edge', () => {
    // One sample means no step to take, so x stays at 0.
    assert.equal(createPath([5], 100, 50, 0, 10), 'M 0 25');
  });

  it('spans the full width and inverts y', () => {
    // y is measured down from the top, so the maximum sits at 0.
    assert.equal(createPath([0, 10], 100, 50, 0, 10), 'M 0 50 L 100 0');
  });

  it('spaces samples evenly across the width', () => {
    assert.equal(
      createPath([0, 5, 10], 100, 50, 0, 10),
      'M 0 50 L 50 25 L 100 0',
    );
  });

  it('lays a flat signal along the bottom instead of dividing by zero', () => {
    const path = createPath([4, 4, 4], 100, 50, 4, 4);

    assert.equal(path, 'M 0 50 L 50 50 L 100 50');
    assert.ok(!path.includes('NaN'));
  });

  it('reads values outside the declared range without clamping', () => {
    // The caller owns the range; padding it is their business, not ours.
    assert.equal(createPath([-10, 20], 100, 50, 0, 10), 'M 0 100 L 100 -50');
  });
});
