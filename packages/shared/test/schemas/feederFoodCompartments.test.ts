import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFeederFoodCompartmentsPayload,
  parseFeederFoodCompartments,
} from '../../src/schemas/api/feederFoodCompartments.ts';

describe('parseFeederFoodCompartments', () => {
  it('returns an empty map for non-object config', () => {
    assert.equal(parseFeederFoodCompartments(null).size, 0);
    assert.equal(parseFeederFoodCompartments('bad').size, 0);
  });

  it('ignores invalid compartment rows', () => {
    const map = parseFeederFoodCompartments({
      food_compartments: [
        { compartment: '', food_id: 1 },
        { compartment: 'a', food_id: null },
        { compartment: 'b', food_id: '3' },
        { compartment: 'c', food_id: 4 },
      ],
    });

    assert.deepEqual([...map.entries()], [['c', 4]]);
  });

  it('reads valid compartment assignments', () => {
    const map = parseFeederFoodCompartments({
      food_compartments: [
        { compartment: 'default', food_id: 3 },
        { compartment: '1', food_id: 7 },
      ],
    });

    assert.equal(map.get('default'), 3);
    assert.equal(map.get('1'), 7);
  });
});

describe('buildFeederFoodCompartmentsPayload', () => {
  it('preserves compartment order and null food ids', () => {
    assert.deepEqual(
      buildFeederFoodCompartmentsPayload([
        { compartment: '0', food_id: null },
        { compartment: '1', food_id: 5 },
      ]),
      [
        { compartment: '0', food_id: null },
        { compartment: '1', food_id: 5 },
      ],
    );
  });
});
