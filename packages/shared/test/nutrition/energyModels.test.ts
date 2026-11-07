import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  ENERGY_MODELS,
  ENERGY_MODEL_IDS,
  type EnergyCase,
} from '../../src/nutrition/energyModels.ts';
import {
  WATER_MODELS,
  WATER_MODEL_IDS,
} from '../../src/nutrition/waterModels.ts';

const shipped: { energy: string[]; water: string[] } = JSON.parse(
  readFileSync(new URL('./shipped-model-ids.json', import.meta.url), 'utf8'),
);

const luna: EnergyCase = {
  stage: 'adult_neutered',
  goal: 'maintain',
  kg: 4.21,
  targetKg: null,
  ageMonths: 60,
};

function rounded(aim: unknown): unknown {
  if (typeof aim === 'string' || aim === null || typeof aim !== 'object') {
    return aim;
  }
  return Object.fromEntries(
    Object.entries(aim).map(([key, value]) => [
      key,
      typeof value === 'number' ? Math.round(value * 100) / 100 : value,
    ]),
  );
}

describe('shipped model ids', () => {
  it('keeps every energy model id that ever shipped', () => {
    for (const id of shipped.energy) {
      assert.ok(
        ENERGY_MODEL_IDS.some((known) => known === id),
        id,
      );
    }
  });

  it('keeps every water model id that ever shipped', () => {
    for (const id of shipped.water) {
      assert.ok(
        WATER_MODEL_IDS.some((known) => known === id),
        id,
      );
    }
  });

  it('lists every model id in the shipped record', () => {
    assert.deepEqual([...ENERGY_MODEL_IDS].sort(), [...shipped.energy].sort());
    assert.deepEqual([...WATER_MODEL_IDS].sort(), [...shipped.water].sort());
  });
});

// Golden outputs: a shipped model never changes, so a failure here means a new id.
describe('fediaf-2025', () => {
  const model = ENERGY_MODELS['fediaf-2025'];

  it('answers a neutered adult with 52–75 kcal per kg^0.67', () => {
    assert.deepEqual(rounded(model.aim(luna)), {
      target: 166.36,
      tolerance: 30.13,
    });
  });

  it('answers a three-month kitten with 2.0–2.5 × MER', () => {
    const kitten: EnergyCase = {
      ...luna,
      stage: 'growth',
      kg: 1.5,
      ageMonths: 3,
    };
    assert.deepEqual(rounded(model.aim(kitten)), {
      target: 295.23,
      tolerance: 32.8,
    });
  });

  it('answers a ten-month kitten with a single 1.5 × MER', () => {
    const kitten: EnergyCase = {
      ...luna,
      stage: 'growth',
      kg: 1.5,
      ageMonths: 10,
    };
    assert.deepEqual(rounded(model.aim(kitten)), {
      target: 196.82,
      tolerance: null,
    });
  });

  it('does not answer an intact adult', () => {
    assert.equal(
      model.aim({ ...luna, stage: 'adult_intact' }),
      'not_in_source',
    );
  });

  it('does not answer weight loss', () => {
    assert.equal(
      model.aim({ ...luna, goal: 'lose', targetKg: 3.8 }),
      'not_in_source',
    );
  });
});

describe('aaha-2021', () => {
  const model = ENERGY_MODELS['aaha-2021'];

  it('answers a neutered adult with 1.2–1.4 × RER', () => {
    assert.deepEqual(rounded(model.aim(luna)), {
      target: 267.46,
      tolerance: 20.57,
    });
  });

  it('answers an intact adult with 1.4–1.6 × RER', () => {
    const jazz: EnergyCase = { ...luna, stage: 'adult_intact', kg: 5.02 };
    assert.deepEqual(rounded(model.aim(jazz)), {
      target: 352.14,
      tolerance: 23.48,
    });
  });

  it('answers growth with a single 2.5 × RER', () => {
    const kitten: EnergyCase = {
      ...luna,
      stage: 'growth',
      kg: 1.5,
      ageMonths: 3,
    };
    assert.deepEqual(rounded(model.aim(kitten)), {
      target: 237.2,
      tolerance: null,
    });
  });

  it('answers weight loss with 0.8 × RER at the target weight', () => {
    const jazz: EnergyCase = { ...luna, goal: 'lose', kg: 5.02, targetKg: 4.8 };
    assert.deepEqual(rounded(model.aim(jazz)), {
      target: 181.6,
      tolerance: null,
    });
  });

  it('asks for a target weight before answering weight loss', () => {
    assert.equal(model.aim({ ...luna, goal: 'lose' }), 'needs_target_weight');
  });

  it('does not answer weight loss for a kitten', () => {
    const kitten: EnergyCase = {
      ...luna,
      stage: 'growth',
      goal: 'lose',
      targetKg: 1,
    };
    assert.equal(model.aim(kitten), 'not_in_source');
  });
});

describe('kosmal-2025', () => {
  const model = WATER_MODELS['kosmal-2025'];

  it('answers healthy cats with 23–51 ml/kg', () => {
    assert.deepEqual(model.aim('normal'), { target: 37, tolerance: 14 });
  });

  it('answers cats at urinary risk with 42–51 ml/kg', () => {
    assert.deepEqual(model.aim('uti_prone'), { target: 46.5, tolerance: 4.5 });
  });
});
