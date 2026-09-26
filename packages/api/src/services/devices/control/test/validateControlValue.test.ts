import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ControlValueType } from 'shared';

import {
  validateActionArgs,
  validateControlValue,
} from '../validateControlValue.ts';

describe('validateControlValue', () => {
  const grams = { kind: 'number', min: 0, max: 50, step: 0.1 } as const;

  it('accepts a number on its step despite float error', () => {
    assert.equal(validateControlValue(grams, 0.1 + 0.2), null);
  });

  it('rejects numbers off the step, out of bounds or not finite', () => {
    assert.ok(validateControlValue(grams, 0.15));
    assert.ok(validateControlValue(grams, 50.1));
    assert.ok(validateControlValue(grams, -0.1));
    assert.ok(validateControlValue(grams, Number.NaN));
    assert.ok(validateControlValue(grams, '5'));
  });

  it('accepts only a listed option for an enum', () => {
    const mode: ControlValueType = {
      kind: 'enum',
      options: [{ value: 'Eco', label: { text: 'Eco' } }],
    };
    assert.equal(validateControlValue(mode, 'Eco'), null);
    assert.ok(validateControlValue(mode, 'eco'));
  });
});

describe('validateActionArgs', () => {
  const dispense = { portions: { kind: 'number', min: 1, max: 10 } } as const;

  it('requires every declared argument and nothing else', () => {
    assert.equal(validateActionArgs(dispense, { portions: 2 }), null);
    assert.ok(validateActionArgs(dispense, {}));
    assert.ok(validateActionArgs(dispense, { portions: 2, extra: true }));
    assert.ok(validateActionArgs(dispense, { portions: 11 }));
  });
});
