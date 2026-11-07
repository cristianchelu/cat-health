import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { intakeMeasureOf } from '../../src/nutrition/intakeMeasure.ts';

describe('intakeMeasureOf', () => {
  it('stays on amount when every device reports one', () => {
    assert.equal(
      intakeMeasureOf([['amount', 'duration'], ['amount']]),
      'amount',
    );
  });

  it('drops to duration when one device reports only seconds', () => {
    assert.equal(
      intakeMeasureOf([['amount', 'duration'], ['duration']]),
      'duration',
    );
  });

  it('counts logged intake as an amount when there are no devices', () => {
    assert.equal(intakeMeasureOf([]), 'amount');
  });
});
