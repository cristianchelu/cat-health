import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_ENERGY_PLAN, DEFAULT_WATER_PLAN } from 'shared';

import {
  WATER_SCALE,
  draftOf,
  foodNotches,
  foodScale,
  intakePetFor,
  presetAt,
  settingOf,
  waterNotches,
  withTarget,
  withTolerance,
  type NeedsProfile,
} from '../dietaryNeedsModel';

const luna: NeedsProfile = {
  birthDate: '2020-01-01',
  altered: 'altered',
  weightKg: 4.21,
  targetWeightKg: null,
  today: '2026-11-10',
};
const jazz: NeedsProfile = { ...luna, weightKg: 5.02, targetWeightKg: 4.8 };

describe('foodNotches', () => {
  it('has only Maintain while she has no target weight', () => {
    const notches = foodNotches(DEFAULT_ENERGY_PLAN, intakePetFor(luna));
    assert.deepEqual(notches, [
      { preset: 'maintain', target: 166, tolerance: 30 },
    ]);
  });

  it('adds Lose below Maintain once she has a target weight', () => {
    const notches = foodNotches(DEFAULT_ENERGY_PLAN, intakePetFor(jazz));
    assert.deepEqual(
      notches.map((notch) => [notch.preset, notch.target, notch.tolerance]),
      [
        ['lose', 182, 9],
        ['maintain', 187, 34],
      ],
    );
  });
});

describe('waterNotches', () => {
  it("gives the source's own figures per kg, whatever her weight", () => {
    const notches = waterNotches(DEFAULT_WATER_PLAN, intakePetFor(luna));
    assert.deepEqual(notches, [
      { preset: 'normal', target: 37, tolerance: 14 },
      { preset: 'uti_prone', target: 46.5, tolerance: 4.5 },
    ]);
  });
});

describe('draftOf', () => {
  const notches = foodNotches(DEFAULT_ENERGY_PLAN, intakePetFor(jazz));

  it('starts a preset on its notch', () => {
    assert.deepEqual(draftOf({ preset: 'lose' }, notches), {
      target: 182,
      tolerance: 9,
    });
  });

  it('starts a custom band where it was set', () => {
    assert.deepEqual(draftOf({ target: 200, tolerance: 10 }, notches), {
      target: 200,
      tolerance: 10,
    });
  });

  it('has nothing to edit for a preset with no band today', () => {
    const withoutLose = foodNotches(DEFAULT_ENERGY_PLAN, intakePetFor(luna));
    assert.equal(draftOf({ preset: 'lose' }, withoutLose), null);
  });
});

describe('settingOf', () => {
  const notches = foodNotches(DEFAULT_ENERGY_PLAN, intakePetFor(jazz));

  it('saves a draft on a notch as its preset', () => {
    assert.deepEqual(settingOf({ target: 182, tolerance: 9 }, notches), {
      preset: 'lose',
    });
  });

  it('saves a draft between notches as a custom band', () => {
    assert.deepEqual(settingOf({ target: 185, tolerance: 9 }, notches), {
      target: 185,
      tolerance: 9,
    });
  });

  it('saves a notch target with another tolerance as a custom band', () => {
    assert.equal(presetAt({ target: 182, tolerance: 12 }, notches), null);
  });
});

describe('foodScale', () => {
  it('runs from her floor to well above her resting need', () => {
    assert.deepEqual(foodScale(intakePetFor(luna)), {
      min: 124,
      max: 329,
      step: 5,
    });
  });
});

describe('withTarget', () => {
  const scale = foodScale(intakePetFor(luna));

  it('keeps the target on the scale', () => {
    const draft = withTarget({ target: 166, tolerance: 30 }, 999, scale, 124);
    assert.equal(draft.target, 329);
  });

  it('narrows the tolerance when the target nears the floor', () => {
    const draft = withTarget({ target: 166, tolerance: 30 }, 134, scale, 124);
    assert.deepEqual(draft, { target: 134, tolerance: 10 });
  });

  it('leaves water, which has no floor, at its tolerance', () => {
    const draft = withTarget({ target: 37, tolerance: 14 }, 20, WATER_SCALE, 0);
    assert.deepEqual(draft, { target: 20, tolerance: 14 });
  });
});

describe('withTolerance', () => {
  it('lifts the target when the tolerance is too wide for it', () => {
    const draft = withTolerance({ target: 134, tolerance: 10 }, 30, 124);
    assert.deepEqual(draft, { target: 154, tolerance: 30 });
  });

  it('never goes negative', () => {
    const draft = withTolerance({ target: 166, tolerance: 30 }, -5, 124);
    assert.equal(draft.tolerance, 0);
  });
});
