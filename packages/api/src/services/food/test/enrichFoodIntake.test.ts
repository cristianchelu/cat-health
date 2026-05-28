import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateNutrientsFromFood,
  enrichFoodIntakeEventData,
  foodCatalogTypeToIntakeType,
  resolveFoodIdForCompartment,
} from '../enrichFoodIntake.ts';
import type { Food } from '../../../database/types/FoodTable.ts';

const sampleFood: Food = {
  id: 1,
  name: 'Test Kibble',
  brand: 'Brand',
  food_type: 'complete_dry',
  barcode_ean13: null,
  moisture_percent: 10,
  calories_per_100g: 400,
  nutrients: [{ nutrient: 'protein', unit: 'percent', value: 30 }],
  serving_size_g: 50,
  notes: null,
  created_at: 0,
  updated_at: 0,
};

describe('enrichFoodIntake', () => {
  it('calculates calories and moisture from amount', () => {
    const nutrients = calculateNutrientsFromFood(100, sampleFood);
    assert.equal(nutrients.calories, 400);
    assert.equal(nutrients.moisture_ml, 10);
    assert.equal(nutrients.protein_g, 30);
  });

  it('maps catalog food type to intake food type', () => {
    assert.equal(foodCatalogTypeToIntakeType('complete_dry'), 'dry');
    assert.equal(foodCatalogTypeToIntakeType('complete_wet'), 'wet');
    assert.equal(foodCatalogTypeToIntakeType('treat'), 'treat');
  });

  it('enriches food_intake event data with food_id and nutrients', () => {
    const enriched = enrichFoodIntakeEventData(
      { type: 'food_intake', food_type: 'unknown', amount: 50 },
      sampleFood,
    );
    assert.equal(enriched.food_id, 1);
    assert.equal(enriched.food_type, 'dry');
    assert.equal(enriched.nutrients?.calories, 200);
  });

  it('resolves food id by compartment from config', () => {
    const config = {
      food_compartments: [
        { compartment: 'default', food_id: 5 },
        { compartment: '0', food_id: 9 },
      ],
    };
    assert.equal(resolveFoodIdForCompartment(config, 'default'), 5);
    assert.equal(resolveFoodIdForCompartment(config, '0'), 9);
    assert.equal(resolveFoodIdForCompartment(config, 'missing'), undefined);
  });
});
