import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GetFoodDTO } from 'shared';

import {
  coarseFoodGroup,
  foodTypesForGroup,
  intakeFoodType,
  kcalForAmount,
  kcalPerKilogram,
} from '../foodGroups.ts';

function food(overrides: Partial<GetFoodDTO>): GetFoodDTO {
  return {
    id: 1,
    name: 'Test food',
    brand: null,
    food_type: 'complete_wet',
    barcode_ean13: null,
    moisture_percent: null,
    calories_per_100g: null,
    nutrients: null,
    serving_size_g: null,
    notes: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe('coarseFoodGroup', () => {
  it('buckets every catalog type, with drink counting as wet', () => {
    assert.equal(coarseFoodGroup('drink'), 'wet');
    assert.equal(coarseFoodGroup('complete_wet'), 'wet');
    assert.equal(coarseFoodGroup('complementary_wet'), 'wet');
    assert.equal(coarseFoodGroup('complete_dry'), 'dry');
    assert.equal(coarseFoodGroup('complementary_dry'), 'dry');
    assert.equal(coarseFoodGroup('treat'), 'treat');
  });
});

describe('foodTypesForGroup', () => {
  it('inverts the bucketing exactly', () => {
    assert.deepEqual(foodTypesForGroup('wet'), [
      'drink',
      'complete_wet',
      'complementary_wet',
    ]);
    assert.deepEqual(foodTypesForGroup('dry'), [
      'complete_dry',
      'complementary_dry',
    ]);
    assert.deepEqual(foodTypesForGroup('treat'), ['treat']);
  });
});

describe('intakeFoodType', () => {
  it('maps a food through its group and no food to unknown', () => {
    assert.equal(
      intakeFoodType(food({ food_type: 'complementary_dry' })),
      'dry',
    );
    assert.equal(intakeFoodType(null), 'unknown');
  });
});

describe('kcalPerKilogram', () => {
  it('states density the way a label does — per kilo, whole numbers', () => {
    assert.equal(kcalPerKilogram(food({ calories_per_100g: 90 })), 900);
    assert.equal(kcalPerKilogram(food({ calories_per_100g: 380 })), 3800);
    // 0.85 kcal/g is unreadable at a glance; 850 kcal/kg is what is printed.
    assert.equal(kcalPerKilogram(food({ calories_per_100g: 85.4 })), 854);
  });

  it('has nothing to say for a food with no calories recorded', () => {
    assert.equal(kcalPerKilogram(food({ calories_per_100g: null })), null);
  });
});

describe('kcalForAmount', () => {
  it('scales calories_per_100g and passes null through', () => {
    assert.equal(kcalForAmount(food({ calories_per_100g: 90 }), 85), 76.5);
    assert.equal(kcalForAmount(food({ calories_per_100g: null }), 85), null);
    assert.equal(kcalForAmount(food({ calories_per_100g: 90 }), 0), 0);
  });
});
