import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GetFoodDTO } from 'shared';

import {
  NO_BRAND,
  buildFoodBrowseTree,
  isFlatMode,
  stepForGroup,
} from '../foodLadder.ts';

let nextId = 1;

function food(
  name: string,
  brand: string | null,
  foodType: GetFoodDTO['food_type'] = 'complete_wet',
): GetFoodDTO {
  return {
    id: nextId++,
    name,
    brand,
    food_type: foodType,
    barcode_ean13: null,
    moisture_percent: null,
    calories_per_100g: 90,
    nutrients: null,
    serving_size_g: 85,
    notes: null,
    created_at: 0,
    updated_at: 0,
  };
}

describe('buildFoodBrowseTree', () => {
  it('groups by type then brand, both sorted, with unbranded foods last', () => {
    const tree = buildFoodBrowseTree([
      food('Tuna in Gravy', 'Royal Canin'),
      food('Ageing 12+', 'Royal Canin'),
      food('Own brand pouch', null),
      food('Felix Salmon', 'Purina'),
      food('Sterilised 37', 'Royal Canin', 'complete_dry'),
      food('Dreamies', 'Mars', 'treat'),
    ]);

    assert.deepEqual(
      tree.map((node) => node.group),
      ['wet', 'dry', 'treat'],
    );

    const wet = tree[0];
    assert.deepEqual(
      wet.brands.map((node) => node.brand),
      ['Purina', 'Royal Canin', NO_BRAND],
    );
    assert.equal(wet.foodCount, 4);
    assert.deepEqual(
      wet.brands[1].foods.map((f) => f.name),
      ['Ageing 12+', 'Tuna in Gravy'],
    );
  });

  it('drops types the household has none of', () => {
    const tree = buildFoodBrowseTree([
      food('Tuna in Gravy', 'Royal Canin'),
      food('Sterilised 37', 'Royal Canin', 'complete_dry'),
    ]);

    assert.deepEqual(
      tree.map((node) => node.group),
      ['wet', 'dry'],
    );
  });

  it('counts a drink as wet, the way a logged event does', () => {
    const tree = buildFoodBrowseTree([food('Broth', 'Cosma', 'drink')]);
    assert.equal(tree[0].group, 'wet');
  });

  it('treats blank brand strings as no brand at all', () => {
    const tree = buildFoodBrowseTree([food('Mystery pouch', '   ')]);
    assert.equal(tree[0].brands[0].brand, NO_BRAND);
  });
});

describe('isFlatMode', () => {
  it('organizes only once the library outgrows one screen', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      food(`Food ${i}`, 'Brand'),
    );
    assert.equal(isFlatMode(many.slice(0, 8)), true);
    assert.equal(isFlatMode(many), false);
    assert.equal(isFlatMode([]), true);
  });
});

describe('stepForGroup', () => {
  const tree = buildFoodBrowseTree([
    food('Tuna in Gravy', 'Royal Canin'),
    food('Ageing 12+', 'Royal Canin'),
    food('Felix Salmon', 'Purina'),
    // Dry has a single brand with a single food: both levels are pointless.
    food('Sterilised 37', 'Acana', 'complete_dry'),
    // Treats have one brand but two foods: the brand level is pointless.
    food('Dreamies Chicken', 'Mars', 'treat'),
    food('Dreamies Salmon', 'Mars', 'treat'),
  ]);

  it('opens the brand level when a type has several brands', () => {
    assert.deepEqual(stepForGroup(tree, 'wet'), {
      kind: 'brands',
      group: 'wet',
    });
  });

  it('skips a single-brand level straight to that brand’s foods', () => {
    assert.deepEqual(stepForGroup(tree, 'treat'), {
      kind: 'foods',
      group: 'treat',
      brand: 'Mars',
    });
  });

  it('still shows the food rung when a type holds exactly one food', () => {
    /* Choosing the food is the decision, and the list is how you learn the
       tin in your hand is not in the library — never skip it. */
    assert.deepEqual(stepForGroup(tree, 'dry'), {
      kind: 'foods',
      group: 'dry',
      brand: 'Acana',
    });
  });
});
