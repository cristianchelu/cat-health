import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_TARGETS,
  bandWeightG,
  targetsAt,
  type TargetEvent,
  type WeighIn,
} from '../intakeTargets.ts';

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));

describe('targetsAt', () => {
  const lose: TargetEvent = {
    at: day(5),
    data: {
      type: 'intake_target',
      kind: 'food',
      measure: 'amount',
      tracked: true,
      plan: ['aaha-2021'],
      setting: { preset: 'lose' },
    },
  };
  const untrackedWater: TargetEvent = {
    at: day(6),
    data: {
      type: 'intake_target',
      kind: 'water',
      measure: 'amount',
      tracked: false,
      plan: ['kosmal-2025'],
      setting: { preset: 'normal' },
    },
  };
  const targetWeight: TargetEvent = {
    at: day(7),
    data: { type: 'weight_target', target_g: 4800 },
  };
  const cleared: TargetEvent = {
    at: day(9),
    data: { type: 'weight_target', target_g: null },
  };
  const events = [lose, untrackedWater, targetWeight, cleared];

  it('gives the defaults before her first target event', () => {
    assert.deepEqual(targetsAt(events, day(4)), DEFAULT_TARGETS);
  });

  it('takes a target from the moment it is set', () => {
    assert.deepEqual(targetsAt(events, day(5)).food.setting, {
      preset: 'lose',
    });
  });

  it('keeps the plan a target was set with', () => {
    assert.deepEqual(targetsAt(events, day(5)).food.plan, ['aaha-2021']);
  });

  it('leaves the other kind as it was', () => {
    assert.deepEqual(targetsAt(events, day(5)).water, DEFAULT_TARGETS.water);
  });

  it('carries whether a band is tracked', () => {
    assert.equal(targetsAt(events, day(6)).water.tracked, false);
  });

  it('takes a target weight from the moment it is set', () => {
    assert.equal(targetsAt(events, day(8)).targetWeightG, 4800);
  });

  it('clears a target weight with a null one', () => {
    assert.equal(targetsAt(events, day(9)).targetWeightG, null);
  });
});

describe('bandWeightG', () => {
  const weighIn = (n: number, grams: number): WeighIn => ({
    at: day(n),
    grams,
  });

  it('is null for a cat that has never been weighed', () => {
    assert.equal(bandWeightG([], day(10)), null);
  });

  it('is the median of the recent weigh-ins, so one odd one does not move it', () => {
    const weighIns = [weighIn(7, 4200), weighIn(8, 9000), weighIn(9, 4210)];
    assert.equal(bandWeightG(weighIns, day(10)), 4210);
  });

  it('is the mean of the two middle weigh-ins when there is an even number', () => {
    const weighIns = [weighIn(8, 4200), weighIn(9, 4220)];
    assert.equal(bandWeightG(weighIns, day(10)), 4210);
  });

  it('ignores weigh-ins after the moment asked about', () => {
    const weighIns = [weighIn(8, 4200), weighIn(12, 5000)];
    assert.equal(bandWeightG(weighIns, day(10)), 4200);
  });

  it('falls back to her last weigh-in when none is recent', () => {
    const old: WeighIn = { at: new Date(Date.UTC(2026, 8, 1)), grams: 4100 };
    assert.equal(bandWeightG([old], day(10)), 4100);
  });

  it('leaves out weigh-ins older than the window once there are recent ones', () => {
    const old: WeighIn = { at: new Date(Date.UTC(2026, 8, 1)), grams: 9000 };
    assert.equal(bandWeightG([old, weighIn(9, 4200)], day(10)), 4200);
  });
});
