import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MICROCHIP_PATTERN,
  PRESENCE_CHOICES,
  petAge,
  presenceChoiceOf,
  presenceForChoice,
} from '../petFormModel.ts';

describe('petAge', () => {
  it('counts whole years and leftover months', () => {
    assert.deepEqual(petAge('2019-04-02', new Date(2026, 9, 25)), {
      years: 7,
      months: 6,
    });
  });

  it('does not count the month until its day has come', () => {
    assert.deepEqual(petAge('2025-10-26', new Date(2026, 9, 25)), {
      years: 0,
      months: 11,
    });
    assert.deepEqual(petAge('2025-10-25', new Date(2026, 9, 25)), {
      years: 1,
      months: 0,
    });
  });

  it('has no age for a missing or future birth date', () => {
    assert.equal(petAge(null, new Date(2026, 9, 25)), null);
    assert.equal(petAge('', new Date(2026, 9, 25)), null);
    assert.equal(petAge('2026-11-01', new Date(2026, 9, 25)), null);
  });
});

describe('presence choices', () => {
  it('round-trips every choice through the event model', () => {
    for (const choice of PRESENCE_CHOICES) {
      assert.equal(presenceChoiceOf(presenceForChoice(choice)), choice);
    }
  });

  it('reads no presence as home and travel as other', () => {
    assert.equal(presenceChoiceOf(null), 'home');
    assert.equal(
      presenceChoiceOf({ state: 'away', context: 'travel' }),
      'other',
    );
  });
});

describe('MICROCHIP_PATTERN', () => {
  it('takes 9 to 15 digits with spaces between groups', () => {
    assert.equal(MICROCHIP_PATTERN.test('941 000 024 518 307'), true);
    assert.equal(MICROCHIP_PATTERN.test('123456789'), true);
    assert.equal(MICROCHIP_PATTERN.test('12345678'), false);
    assert.equal(MICROCHIP_PATTERN.test('9410000245183071'), false);
    assert.equal(MICROCHIP_PATTERN.test('941-000-024'), false);
  });
});
