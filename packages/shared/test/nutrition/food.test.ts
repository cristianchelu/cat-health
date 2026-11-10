import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { boundsOf, type IntakeGap } from '../../src/nutrition/band.ts';
import {
  DEFAULT_ENERGY_PLAN,
  ENERGY_MODEL_IDS,
  answerEnergy,
  resolveFoodBand,
  type FoodPreset,
  type EnergyModelId,
  type FoodBand,
} from '../../src/nutrition/food.ts';
import type { IntakePet } from '../../src/nutrition/pet.ts';

const shipped: { energy: string[]; water: string[] } = JSON.parse(
  readFileSync(new URL('./shipped-model-ids.json', import.meta.url), 'utf8'),
);

const luna: IntakePet = {
  ageMonths: 60,
  altered: 'altered',
  kg: 4.21,
  targetKg: null,
};
const jazz: IntakePet = { ...luna, kg: 5.02, targetKg: 4.8 };

/** A model's raw answer to two decimals, so a golden value reads as the source's arithmetic. */
function twoDecimals(range: { low: number; high: number }) {
  const round = (value: number) => Math.round(value * 100) / 100;
  return { low: round(range.low), high: round(range.high) };
}

/** One model's answer on its own, with no plan to fall through. */
function kcal(modelId: EnergyModelId, preset: FoodPreset, pet: IntakePet) {
  const answer = answerEnergy([modelId], preset, pet);
  return 'gap' in answer ? answer.gap : twoDecimals(answer.kcalPerDay);
}

/** The band of a result that is expected to have one. */
function resolved(result: FoodBand | { gap: IntakeGap }): FoodBand {
  assert.ok(!('gap' in result), 'expected a band');
  return result;
}

it('lists exactly the energy model ids that ever shipped', () => {
  assert.deepEqual([...ENERGY_MODEL_IDS].sort(), [...shipped.energy].sort());
});

// Golden outputs: a shipped model never changes, so a failure here means a new id.
describe('fediaf-2025', () => {
  it('answers an altered adult with 52–75 kcal per kg^0.67', () => {
    assert.deepEqual(kcal('fediaf-2025', 'maintain', luna), {
      low: 136.23,
      high: 196.49,
    });
  });

  it('answers a three-month kitten with 2.0–2.5 × MER', () => {
    const kitten: IntakePet = {
      ...luna,
      kg: 1.5,
      ageMonths: 3,
    };
    assert.deepEqual(kcal('fediaf-2025', 'maintain', kitten), {
      low: 262.43,
      high: 328.04,
    });
  });

  it('answers a ten-month kitten with a single 1.5 × MER', () => {
    const kitten: IntakePet = {
      ...luna,
      kg: 1.5,
      ageMonths: 10,
    };
    assert.deepEqual(kcal('fediaf-2025', 'maintain', kitten), {
      low: 196.82,
      high: 196.82,
    });
  });

  it('answers an adult of unknown age with the adult row', () => {
    const unknown: IntakePet = { ...luna, ageMonths: null };
    assert.deepEqual(kcal('fediaf-2025', 'maintain', unknown), {
      low: 136.23,
      high: 196.49,
    });
  });

  it('does not answer an intact adult', () => {
    const intact: IntakePet = { ...luna, altered: 'intact' };
    assert.equal(kcal('fediaf-2025', 'maintain', intact), 'not_in_source');
  });

  it('does not answer weight loss', () => {
    const losing: IntakePet = { ...luna, targetKg: 3.8 };
    assert.equal(kcal('fediaf-2025', 'lose', losing), 'not_in_source');
  });
});

describe('aaha-2021', () => {
  it('answers an altered adult with 1.2–1.4 × RER', () => {
    assert.deepEqual(kcal('aaha-2021', 'maintain', luna), {
      low: 246.88,
      high: 288.03,
    });
  });

  it('answers an intact adult with 1.4–1.6 × RER', () => {
    const jazz: IntakePet = { ...luna, altered: 'intact', kg: 5.02 };
    assert.deepEqual(kcal('aaha-2021', 'maintain', jazz), {
      low: 328.67,
      high: 375.62,
    });
  });

  it('answers growth with a single 2.5 × RER', () => {
    const kitten: IntakePet = {
      ...luna,
      kg: 1.5,
      ageMonths: 3,
    };
    assert.deepEqual(kcal('aaha-2021', 'maintain', kitten), {
      low: 237.2,
      high: 237.2,
    });
  });

  it('answers weight loss with 0.8 × RER at the target weight', () => {
    const jazz: IntakePet = { ...luna, kg: 5.02, targetKg: 4.8 };
    assert.deepEqual(kcal('aaha-2021', 'lose', jazz), {
      low: 181.6,
      high: 181.6,
    });
  });

  it('asks for a target weight before answering weight loss', () => {
    assert.equal(kcal('aaha-2021', 'lose', luna), 'needs_target_weight');
  });

  it('does not answer weight loss for a kitten', () => {
    const kitten: IntakePet = {
      ...luna,
      targetKg: 1,
      ageMonths: 3,
    };
    assert.equal(kcal('aaha-2021', 'lose', kitten), 'not_in_source');
  });
});

describe('resolveFoodBand', () => {
  it('maintains an altered adult on FEDIAF, in whole kcal', () => {
    const band = resolved(
      resolveFoodBand({ preset: 'maintain' }, DEFAULT_ENERGY_PLAN, luna),
    );
    assert.deepEqual(boundsOf(band), { lower: 136, upper: 196 });
  });

  it('names the model and row that answered', () => {
    const band = resolved(
      resolveFoodBand({ preset: 'maintain' }, DEFAULT_ENERGY_PLAN, luna),
    );
    assert.deepEqual(band.origin, {
      kind: 'preset',
      preset: 'maintain',
      modelId: 'fediaf-2025',
      ref: 'Table VII-9, neutered and/or indoor',
    });
  });

  it('loses weight on AAHA at the target weight, with the point tolerance', () => {
    const band = resolved(
      resolveFoodBand({ preset: 'lose' }, DEFAULT_ENERGY_PLAN, jazz),
    );
    assert.deepEqual(boundsOf(band), { lower: 173, upper: 191 });
  });

  it('keeps the Lose band once she is below her target weight', () => {
    const reached: IntakePet = { ...jazz, kg: 4.7 };
    const band = resolved(
      resolveFoodBand({ preset: 'lose' }, DEFAULT_ENERGY_PLAN, reached),
    );
    assert.deepEqual(boundsOf(band), { lower: 173, upper: 191 });
  });

  it('measures Lose and its floor at a target weight far below her weight', () => {
    const obese: IntakePet = { ...jazz, kg: 7 };
    const band = resolved(
      resolveFoodBand({ preset: 'lose' }, DEFAULT_ENERGY_PLAN, obese),
    );
    assert.deepEqual(boundsOf(band), { lower: 173, upper: 191 });
    assert.deepEqual(band.adjustments, ['point_tolerance']);
  });

  it('marks a tolerance that came from the point tolerance', () => {
    const band = resolved(
      resolveFoodBand({ preset: 'lose' }, DEFAULT_ENERGY_PLAN, jazz),
    );
    assert.deepEqual(band.adjustments, ['point_tolerance']);
  });

  it('reports weight loss as uncovered until a target weight is set', () => {
    const result = resolveFoodBand(
      { preset: 'lose' },
      DEFAULT_ENERGY_PLAN,
      luna,
    );
    assert.deepEqual(result, { gap: 'needs_target_weight' });
  });

  it('hands a case to the next model when the first has no row for it', () => {
    const intact: IntakePet = { ...jazz, altered: 'intact' };
    const band = resolved(
      resolveFoodBand({ preset: 'maintain' }, DEFAULT_ENERGY_PLAN, intact),
    );
    assert.ok(band.origin.kind === 'preset');
    assert.equal(band.origin.modelId, 'aaha-2021');
  });

  it('reports a case no model in the plan answers as uncovered', () => {
    const kitten: IntakePet = { ...luna, ageMonths: 3 };
    const result = resolveFoodBand(
      { preset: 'lose' },
      DEFAULT_ENERGY_PLAN,
      kitten,
    );
    assert.deepEqual(result, { gap: 'not_in_source' });
  });

  it('grows a three-month kitten on FEDIAF', () => {
    const kitten: IntakePet = {
      altered: 'intact',
      kg: 1.5,
      targetKg: null,
      ageMonths: 3,
    };
    const band = resolved(
      resolveFoodBand({ preset: 'maintain' }, DEFAULT_ENERGY_PLAN, kitten),
    );
    assert.deepEqual(boundsOf(band), { lower: 262, upper: 328 });
  });

  it('maintains a senior on the same FEDIAF row as any adult', () => {
    const senior: IntakePet = { ...luna, ageMonths: 140 };
    const band = resolved(
      resolveFoodBand({ preset: 'maintain' }, DEFAULT_ENERGY_PLAN, senior),
    );
    assert.deepEqual(boundsOf(band), { lower: 136, upper: 196 });
  });

  it('keeps a custom band as set', () => {
    const band = resolved(
      resolveFoodBand({ target: 182, tolerance: 2 }, DEFAULT_ENERGY_PLAN, luna),
    );
    assert.deepEqual(boundsOf(band), { lower: 180, upper: 184 });
    assert.deepEqual(band.adjustments, []);
  });

  it('carries the vet visit a custom band cites', () => {
    const setting = { target: 180, tolerance: 10, source_event_id: 42 };
    const band = resolved(resolveFoodBand(setting, DEFAULT_ENERGY_PLAN, luna));
    assert.deepEqual(band.origin, { kind: 'custom', sourceEventId: 42 });
  });

  it('lifts a custom band that dips below the floor', () => {
    const band = resolved(
      resolveFoodBand(
        { target: 100, tolerance: 10 },
        DEFAULT_ENERGY_PLAN,
        luna,
      ),
    );
    assert.equal(boundsOf(band).lower, 124);
    assert.deepEqual(band.adjustments, ['floor']);
  });
});
