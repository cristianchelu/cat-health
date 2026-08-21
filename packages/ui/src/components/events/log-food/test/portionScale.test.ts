import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPortionScale } from '../portionScale.ts';

describe('buildPortionScale', () => {
  it('runs to exactly one serving, with a stop every quarter', () => {
    const scale = buildPortionScale(85);

    assert.equal(scale.max, 85);
    assert.deepEqual(scale.detents, [0, 21, 43, 64, 85]);
  });

  it('labels every quarter, the last one as the whole pouch', () => {
    const scale = buildPortionScale(85);

    assert.deepEqual(
      [...scale.labels.entries()],
      [
        [0, '0'],
        [21, '¼'],
        [43, '½'],
        [64, '¾'],
      ],
    );
    assert.equal(scale.pouchLabelValue, 85);
  });

  it('degrades to a plain gram slider when no serving size is recorded', () => {
    for (const size of [null, 0, -5]) {
      const scale = buildPortionScale(size);
      assert.equal(scale.max, 100);
      assert.deepEqual(scale.detents, []);
      assert.equal(scale.labels.size, 0);
      assert.equal(scale.pouchLabelValue, null);
    }
  });

  it('never repeats a stop when quarters round together', () => {
    // A 2 g treat: quarters land on the same gram more than once.
    const scale = buildPortionScale(2);

    assert.deepEqual(scale.detents, [0, 1, 2]);
    assert.equal(new Set(scale.detents).size, scale.detents.length);
  });
});
