import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { downsample } from '../downsample.ts';

/** A flat trace with one tall spike, the shape LTTB exists to preserve. */
function spikeAt(index: number, length: number): number[] {
  return Array.from({ length }, (_, i) => (i === index ? 100 : 0));
}

describe('downsample', () => {
  it('returns the input untouched when it already fits', () => {
    const data = [1, 2, 3];

    assert.equal(downsample(data, 10), data);
    assert.equal(downsample(data, 3), data);
  });

  it('returns exactly the requested number of points', () => {
    const data = Array.from({ length: 1000 }, (_, i) => i);

    assert.equal(downsample(data, 100).length, 100);
    assert.equal(downsample(data, 5).length, 5);
  });

  it('keeps the first and last sample', () => {
    const data = Array.from({ length: 500 }, (_, i) => i * 2);
    const sampled = downsample(data, 50);

    assert.equal(sampled[0], 0);
    assert.equal(sampled.at(-1), 998);
  });

  it('keeps a spike that plain decimation would drop', () => {
    // Index 137 survives no every-nth-sample rule that lands on round numbers.
    const sampled = downsample(spikeAt(137, 1000), 50);

    assert.ok(sampled.includes(100));
  });

  it('survives a flat signal, where every triangle has zero area', () => {
    const sampled = downsample(new Array(1000).fill(7), 50);

    assert.equal(sampled.length, 50);
    assert.ok(sampled.every((value) => value === 7));
  });

  it('never invents a value that was not sampled', () => {
    const data = Array.from({ length: 400 }, (_, i) => Math.sin(i / 10));
    const source = new Set(data);

    assert.ok(downsample(data, 40).every((value) => source.has(value)));
  });
});
