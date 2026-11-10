import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  boundsOf,
  type Band,
  type IntakeGap,
} from '../../src/nutrition/band.ts';
import type { IntakePet } from '../../src/nutrition/pet.ts';
import {
  DEFAULT_WATER_PLAN,
  WATER_MODEL_IDS,
  answerWater,
  resolveWaterBand,
  type WaterBand,
  type WaterPreset,
} from '../../src/nutrition/water.ts';

const shipped: { energy: string[]; water: string[] } = JSON.parse(
  readFileSync(new URL('./shipped-model-ids.json', import.meta.url), 'utf8'),
);

const luna: IntakePet = {
  ageMonths: 60,
  altered: 'altered',
  kg: 4.21,
  targetKg: null,
};

function twoDecimals(range: { low: number; high: number }) {
  const round = (value: number) => Math.round(value * 100) / 100;
  return { low: round(range.low), high: round(range.high) };
}

function ml(preset: WaterPreset, kg: number) {
  const answer = answerWater(['kosmal-2025'], preset, { ...luna, kg });
  return 'gap' in answer ? answer.gap : twoDecimals(answer.mlPerDay);
}

/** A band's bounds to two decimals, so expectations read as the source's numbers. */
function bounds(band: Band) {
  const round = (value: number) => Math.round(value * 100) / 100;
  const { lower, upper } = boundsOf(band);
  return { lower: round(lower), upper: round(upper) };
}

function resolved(result: WaterBand | { gap: IntakeGap }): WaterBand {
  assert.ok(!('gap' in result), 'expected a band');
  return result;
}

it('lists exactly the water model ids that ever shipped', () => {
  assert.deepEqual([...WATER_MODEL_IDS].sort(), [...shipped.water].sort());
});

// Golden outputs: a shipped model never changes, so a failure here means a new id.
describe('kosmal-2025', () => {
  it('answers healthy cats with 23–51 ml/kg', () => {
    assert.deepEqual(ml('normal', 4), { low: 92, high: 204 });
  });

  it('answers cats at urinary risk with 42–51 ml/kg', () => {
    assert.deepEqual(ml('uti_prone', 4), { low: 168, high: 204 });
  });
});

describe('resolveWaterBand', () => {
  it('turns the Normal preset into ml a day at her weight', () => {
    const band = resolved(
      resolveWaterBand({ preset: 'normal' }, DEFAULT_WATER_PLAN, luna),
    );
    assert.deepEqual(bounds(band), { lower: 96.83, upper: 214.71 });
  });

  it('turns the UTI-prone preset into ml a day at her weight', () => {
    const band = resolved(
      resolveWaterBand({ preset: 'uti_prone' }, DEFAULT_WATER_PLAN, luna),
    );
    assert.deepEqual(bounds(band), { lower: 176.82, upper: 214.71 });
  });

  it('scales a custom ml/kg band by her weight', () => {
    const band = resolved(
      resolveWaterBand({ target: 40, tolerance: 5 }, DEFAULT_WATER_PLAN, {
        ...luna,
        kg: 4,
      }),
    );
    assert.deepEqual(boundsOf(band), { lower: 140, upper: 180 });
  });

  it('reports a preset no model in the plan has as uncovered', () => {
    assert.deepEqual(resolveWaterBand({ preset: 'normal' }, [], luna), {
      gap: 'not_in_source',
    });
  });
});
