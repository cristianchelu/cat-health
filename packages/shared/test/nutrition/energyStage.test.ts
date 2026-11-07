import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ageInMonths,
  energyStageOf,
  type EnergyStageInput,
} from '../../src/nutrition/energyStage.ts';

describe('ageInMonths', () => {
  it('counts whole calendar months', () => {
    assert.equal(ageInMonths('2026-01-15', '2026-04-15'), 3);
  });

  it('does not count a month that has not finished', () => {
    assert.equal(ageInMonths('2026-01-15', '2026-04-14'), 2);
  });
});

describe('energyStageOf', () => {
  it('puts a cat under a year in growth', () => {
    const pet: EnergyStageInput = {
      birthDate: '2026-03-01',
      altered: 'intact',
    };
    assert.equal(energyStageOf(pet, '2026-11-07'), 'growth');
  });

  it('moves her to adult on her first birthday', () => {
    const pet: EnergyStageInput = {
      birthDate: '2025-11-07',
      altered: 'altered',
    };
    assert.equal(energyStageOf(pet, '2026-11-07'), 'adult_neutered');
  });

  it('treats a cat with no birth date as an adult', () => {
    const pet: EnergyStageInput = { birthDate: null, altered: 'intact' };
    assert.equal(energyStageOf(pet, '2026-11-07'), 'adult_intact');
  });

  it('treats unknown neutering as neutered', () => {
    const pet: EnergyStageInput = { birthDate: null, altered: 'unknown' };
    assert.equal(energyStageOf(pet, '2026-11-07'), 'adult_neutered');
  });
});
