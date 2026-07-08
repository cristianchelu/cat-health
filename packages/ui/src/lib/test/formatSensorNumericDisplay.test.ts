import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decimalsImpliedByStep,
  formatSensorNumericDisplay,
  roundEntityNumericValue,
} from '../formatSensorNumericDisplay.ts';

describe('decimalsImpliedByStep', () => {
  it('infers fractional digits from ESPHome step values', () => {
    assert.equal(decimalsImpliedByStep(1), 0);
    assert.equal(decimalsImpliedByStep(0.05), 2);
    assert.equal(decimalsImpliedByStep(0), undefined);
  });
});

describe('formatSensorNumericDisplay', () => {
  it('honors accuracy_decimals from entity metadata', () => {
    assert.equal(
      formatSensorNumericDisplay(23.456, { accuracyDecimals: 1 }),
      '23.5',
    );
  });

  it('uses device_class heuristics when accuracy is unknown', () => {
    assert.equal(
      formatSensorNumericDisplay(41.28, { deviceClass: 'temperature' }),
      '41.3',
    );
  });
});

describe('roundEntityNumericValue', () => {
  it('rounds using the same rules as display formatting', () => {
    assert.equal(
      roundEntityNumericValue(12.345, { accuracyDecimals: 2 }),
      12.35,
    );
  });
});
