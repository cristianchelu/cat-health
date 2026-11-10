import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_ENERGY_PLAN,
  DEFAULT_WATER_PLAN,
  type FoodBandSetting,
} from 'shared';

import {
  WATER_SCALE,
  draftOf,
  foodChange,
  foodNotches,
  foodScale,
  intakePetFor,
  parseTargetWeight,
  presetAt,
  settingOf,
  waterChange,
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
  const onMaintain: FoodBandSetting = { preset: 'maintain' };

  it('has only Maintain while she has no target weight', () => {
    const notches = foodNotches(
      DEFAULT_ENERGY_PLAN,
      intakePetFor(luna),
      onMaintain,
    );
    assert.deepEqual(notches, [
      { preset: 'maintain', target: 166, tolerance: 30 },
    ]);
  });

  it('does not offer Lose to a cat whose target weight is above her weight', () => {
    const underweight = intakePetFor({ ...luna, targetWeightKg: 4.8 });
    const notches = foodNotches(DEFAULT_ENERGY_PLAN, underweight, onMaintain);
    assert.deepEqual(
      notches.map((notch) => notch.preset),
      ['maintain'],
    );
  });

  it('does not offer Lose when its band is not below the Maintain one', () => {
    // At 6.28 kg with a 6.2 kg target, Lose is 220 kcal against Maintain's 217.
    const nearTarget = intakePetFor({
      ...luna,
      weightKg: 6.275,
      targetWeightKg: 6.2,
    });
    const notches = foodNotches(DEFAULT_ENERGY_PLAN, nearTarget, onMaintain);
    assert.deepEqual(
      notches.map((notch) => notch.preset),
      ['maintain'],
    );
  });

  it('keeps the Lose notch for a band already on it, once she has reached her target', () => {
    const reached = intakePetFor({ ...jazz, weightKg: 4.7 });
    const notches = foodNotches(DEFAULT_ENERGY_PLAN, reached, {
      preset: 'lose',
    });
    assert.ok(notches.some((notch) => notch.preset === 'lose'));
  });

  it('adds Lose below Maintain once she has a target weight', () => {
    const notches = foodNotches(
      DEFAULT_ENERGY_PLAN,
      intakePetFor(jazz),
      onMaintain,
    );
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
  const notches = foodNotches(DEFAULT_ENERGY_PLAN, intakePetFor(jazz), {
    preset: 'maintain',
  });

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
    const withoutLose = foodNotches(DEFAULT_ENERGY_PLAN, intakePetFor(luna), {
      preset: 'maintain',
    });
    assert.equal(draftOf({ preset: 'lose' }, withoutLose), null);
  });
});

describe('settingOf', () => {
  const notches = foodNotches(DEFAULT_ENERGY_PLAN, intakePetFor(jazz), {
    preset: 'maintain',
  });

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

describe('parseTargetWeight', () => {
  it('reads an empty field as no target weight', () => {
    assert.equal(parseTargetWeight('  '), null);
  });

  it('reads a weight typed with a decimal comma', () => {
    assert.equal(parseTargetWeight('4,8'), 4.8);
  });

  it('refuses text that is not a weight above zero', () => {
    assert.deepEqual(
      [
        parseTargetWeight('abc'),
        parseTargetWeight('0'),
        parseTargetWeight('-2'),
      ],
      ['invalid', 'invalid', 'invalid'],
    );
  });
});

describe('foodChange', () => {
  it('sends the food band as the setting it sits on, and the target weight in kg', () => {
    const change = foodChange({
      tracked: true,
      setting: { preset: 'lose' },
      targetWeight: '4.8',
    });
    assert.deepEqual(change, {
      food: { tracked: true, setting: { preset: 'lose' } },
      target_weight_kg: 4.8,
    });
  });

  it('clears the target weight when the field is empty', () => {
    const change = foodChange({
      tracked: true,
      setting: { preset: 'maintain' },
      targetWeight: '',
    });
    assert.equal(change.target_weight_kg, null);
  });
});

describe('waterChange', () => {
  it('sends only the water band, so saving it leaves food alone', () => {
    const change = waterChange({
      tracked: false,
      setting: { target: 40, tolerance: 5 },
    });
    assert.deepEqual(change, {
      water: { tracked: false, setting: { target: 40, tolerance: 5 } },
    });
  });
});
