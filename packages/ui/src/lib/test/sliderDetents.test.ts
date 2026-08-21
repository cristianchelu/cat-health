import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detentAfter, detentBefore, nearestDetent } from '../sliderDetents.ts';

const STOPS = [0, 20, 40];

describe('nearestDetent', () => {
  it('picks the closest stop, ties going to the lower one', () => {
    assert.equal(nearestDetent(STOPS, 24), 20);
    assert.equal(nearestDetent(STOPS, 31), 40);
    assert.equal(nearestDetent(STOPS, 30), 20);
  });

  it('clamps to the ends for values outside the range', () => {
    assert.equal(nearestDetent(STOPS, -5), 0);
    assert.equal(nearestDetent(STOPS, 99), 40);
  });
});

describe('detentBefore / detentAfter', () => {
  it('steps strictly past the current value', () => {
    assert.equal(detentAfter(STOPS, 20), 40);
    assert.equal(detentBefore(STOPS, 20), 0);
    assert.equal(detentAfter(STOPS, 21), 40);
    assert.equal(detentBefore(STOPS, 19), 0);
  });

  it('returns null at the ends so callers can fall back', () => {
    assert.equal(detentAfter(STOPS, 40), null);
    assert.equal(detentBefore(STOPS, 0), null);
  });
});
