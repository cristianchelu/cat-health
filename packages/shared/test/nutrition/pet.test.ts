import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ageInMonths,
  alteredOf,
  intakePetOf,
  lifeStageOf,
  type IntakePetInput,
} from '../../src/nutrition/pet.ts';

describe('ageInMonths', () => {
  it('counts whole calendar months', () => {
    assert.equal(ageInMonths('2026-01-15', '2026-04-15'), 3);
  });

  it('does not count a month that has not finished', () => {
    assert.equal(ageInMonths('2026-01-15', '2026-04-14'), 2);
  });
});

describe('lifeStageOf', () => {
  it('keeps a cat under a year a kitten', () => {
    assert.equal(lifeStageOf(11), 'kitten');
  });

  it('makes her a young adult on her first birthday', () => {
    assert.equal(lifeStageOf(12), 'young_adult');
  });

  it('makes her a mature adult at 7', () => {
    assert.equal(lifeStageOf(7 * 12), 'mature_adult');
  });

  it('keeps her a mature adult through 10', () => {
    assert.equal(lifeStageOf(11 * 12 - 1), 'mature_adult');
  });

  it('makes her a senior at 11', () => {
    assert.equal(lifeStageOf(11 * 12), 'senior');
  });

  it('gives no stage when her age is unknown', () => {
    assert.equal(lifeStageOf(null), null);
  });
});

describe('alteredOf', () => {
  it('keeps intact as intact', () => {
    assert.equal(alteredOf('intact'), 'intact');
  });

  it('treats a cat not known to be intact as altered', () => {
    assert.equal(alteredOf('unknown'), 'altered');
  });
});

describe('intakePetOf', () => {
  const jazz: IntakePetInput = {
    birthDate: '2019-03-01',
    altered: 'unknown',
    kg: 5.02,
    targetKg: 4.8,
  };

  it('reads her age and whether she is altered on the day', () => {
    const pet = intakePetOf(jazz, '2026-11-09');
    assert.deepEqual([pet.ageMonths, pet.altered], [92, 'altered']);
  });

  it('keeps a target weight below her weight', () => {
    assert.equal(intakePetOf(jazz, '2026-11-09').targetKg, 4.8);
  });

  it('keeps a target weight she has reached or passed', () => {
    const reached: IntakePetInput = { ...jazz, kg: 4.75 };
    assert.equal(intakePetOf(reached, '2026-11-09').targetKg, 4.8);
  });

  it('keeps a target weight far below her weight', () => {
    const gained: IntakePetInput = { ...jazz, kg: 7 };
    assert.equal(intakePetOf(gained, '2026-11-09').targetKg, 4.8);
  });

  it('gives no age without a birth date', () => {
    const unknown: IntakePetInput = { ...jazz, birthDate: null };
    assert.equal(intakePetOf(unknown, '2026-11-09').ageMonths, null);
  });
});
