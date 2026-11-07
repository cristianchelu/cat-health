import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  foodPresetAim,
  resolveDurationBand,
  resolveFoodBand,
  resolveWaterBand,
  type FoodContext,
} from '../../src/nutrition/intakeBands.ts';
import {
  DEFAULT_ENERGY_PLAN,
  DEFAULT_WATER_PLAN,
} from '../../src/nutrition/intakePlans.ts';
import type { EnergyPlan } from '../../src/schemas/api/dietaryNeeds.ts';

const luna: FoodContext = {
  kg: 4.21,
  targetKg: null,
  stage: 'adult_neutered',
  ageMonths: 60,
};
const jazz: FoodContext = { ...luna, kg: 5.02, targetKg: 4.8 };

describe('resolveFoodBand', () => {
  it('maintains a neutered adult on FEDIAF, rounded to 5 kcal', () => {
    const result = resolveFoodBand(
      { preset: 'maintain' },
      DEFAULT_ENERGY_PLAN,
      luna,
    );
    assert.ok('lower' in result);
    assert.deepEqual([result.lower, result.upper], [135, 195]);
  });

  it('names the stage, model and source that answered', () => {
    const result = resolveFoodBand(
      { preset: 'maintain' },
      DEFAULT_ENERGY_PLAN,
      luna,
    );
    assert.ok('origin' in result);
    assert.deepEqual(result.origin, {
      kind: 'food_preset',
      preset: 'maintain',
      stage: 'adult_neutered',
      modelId: 'fediaf-2025',
      sourceId: 'fediaf-2025',
      pointTolerance: false,
    });
  });

  it('loses weight on AAHA at the target weight, with the point tolerance', () => {
    const result = resolveFoodBand(
      { preset: 'lose' },
      DEFAULT_ENERGY_PLAN,
      jazz,
    );
    assert.ok('lower' in result);
    assert.deepEqual(
      [result.lower, result.upper, result.origin.kind],
      [170, 190, 'food_preset'],
    );
  });

  it('marks a tolerance that came from the point-tolerance guard', () => {
    const result = resolveFoodBand(
      { preset: 'lose' },
      DEFAULT_ENERGY_PLAN,
      jazz,
    );
    assert.ok('origin' in result && result.origin.kind === 'food_preset');
    assert.equal(result.origin.pointTolerance, true);
  });

  it('reports weight loss as uncovered until a target weight is set', () => {
    const result = resolveFoodBand(
      { preset: 'lose' },
      DEFAULT_ENERGY_PLAN,
      luna,
    );
    assert.deepEqual(result, {
      uncovered: {
        stage: 'adult_neutered',
        goal: 'lose',
        gap: 'needs_target_weight',
      },
    });
  });

  it('ignores a target weight below the 70 % guard', () => {
    const result = resolveFoodBand({ preset: 'lose' }, DEFAULT_ENERGY_PLAN, {
      ...jazz,
      targetKg: 3,
    });
    assert.ok('uncovered' in result);
  });

  it('hands an intact adult to the next model in the row', () => {
    const intact: EnergyPlan = {
      ...DEFAULT_ENERGY_PLAN,
      adult_intact: { maintain: ['fediaf-2025', 'aaha-2021'] },
    };
    const result = resolveFoodBand({ preset: 'maintain' }, intact, {
      ...jazz,
      stage: 'adult_intact',
    });
    assert.ok('origin' in result && result.origin.kind === 'food_preset');
    assert.equal(result.origin.modelId, 'aaha-2021');
  });

  it('reports a case with no model in its row as uncovered', () => {
    const result = resolveFoodBand({ preset: 'lose' }, DEFAULT_ENERGY_PLAN, {
      ...luna,
      stage: 'growth',
      ageMonths: 3,
    });
    assert.deepEqual(result, {
      uncovered: { stage: 'growth', goal: 'lose', gap: 'not_in_source' },
    });
  });

  it('grows a three-month kitten on FEDIAF', () => {
    const result = resolveFoodBand(
      { preset: 'maintain' },
      DEFAULT_ENERGY_PLAN,
      {
        kg: 1.5,
        targetKg: null,
        stage: 'growth',
        ageMonths: 3,
      },
    );
    assert.ok('lower' in result);
    assert.deepEqual([result.lower, result.upper], [260, 330]);
  });

  it('keeps a custom band as set', () => {
    const result = resolveFoodBand(
      { target: 180, tolerance: 10 },
      DEFAULT_ENERGY_PLAN,
      luna,
    );
    assert.ok('lower' in result);
    assert.deepEqual(
      [result.lower, result.upper, result.floored],
      [170, 190, false],
    );
  });

  it('carries the vet visit a custom band cites', () => {
    const result = resolveFoodBand(
      { target: 180, tolerance: 10, source_event_id: 42 },
      DEFAULT_ENERGY_PLAN,
      luna,
    );
    assert.ok('origin' in result);
    assert.deepEqual(result.origin, { kind: 'custom', sourceEventId: 42 });
  });

  it('lifts a custom band that dips below the floor', () => {
    const result = resolveFoodBand(
      { target: 100, tolerance: 10 },
      DEFAULT_ENERGY_PLAN,
      luna,
    );
    assert.ok('lower' in result);
    assert.deepEqual([result.lower, result.floored], [125, true]);
  });
});

describe('foodPresetAim', () => {
  it('puts the notch where the resolved preset band sits', () => {
    const aim = foodPresetAim(DEFAULT_ENERGY_PLAN, 'maintain', luna);
    const band = resolveFoodBand(
      { preset: 'maintain' },
      DEFAULT_ENERGY_PLAN,
      luna,
    );
    assert.ok('target' in aim && 'target' in band);
    assert.equal(aim.target, band.target);
  });
});

describe('resolveWaterBand', () => {
  it('turns the Normal preset into ml a day at her weight', () => {
    const result = resolveWaterBand(
      { preset: 'normal' },
      DEFAULT_WATER_PLAN,
      4.21,
    );
    assert.deepEqual([result?.lower, result?.upper], [95, 215]);
  });

  it('turns the UTI-prone preset into ml a day at her weight', () => {
    const result = resolveWaterBand(
      { preset: 'uti_prone' },
      DEFAULT_WATER_PLAN,
      4.21,
    );
    assert.deepEqual([result?.lower, result?.upper], [175, 215]);
  });

  it('scales a custom ml/kg band by her weight', () => {
    const result = resolveWaterBand(
      { target: 40, tolerance: 5 },
      DEFAULT_WATER_PLAN,
      4,
    );
    assert.deepEqual([result?.lower, result?.upper], [140, 180]);
  });

  it('gives no band when no model in the plan has the preset', () => {
    assert.equal(resolveWaterBand({ preset: 'normal' }, {}, 4.21), null);
  });
});

describe('resolveDurationBand', () => {
  it('keeps seconds as set', () => {
    const result = resolveDurationBand({ target: 300, tolerance: 60 });
    assert.deepEqual(
      [result.lower, result.upper, result.unit],
      [240, 360, 's'],
    );
  });
});
