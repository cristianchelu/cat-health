import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ageInMonths,
  alteredOf,
  intakePetOf,
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
