import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getStringValue, isRecord } from '../utils.ts';

describe('isRecord', () => {
  it('accepts plain objects and rejects arrays and primitives', () => {
    assert.equal(isRecord({ a: 1 }), true);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord(null), false);
    assert.equal(isRecord('x'), false);
  });
});

describe('getStringValue', () => {
  it('returns string fields and ignores other types', () => {
    const record = { name: 'Mochi', age: 3 };
    assert.equal(getStringValue(record, 'name'), 'Mochi');
    assert.equal(getStringValue(record, 'age'), undefined);
    assert.equal(getStringValue(record, 'missing'), undefined);
  });
});
