import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceBooleanState,
  coerceNumericState,
} from '../BaseESPHomeController.ts';

describe('proto3 default-elision coercion', () => {
  it('reads an absent numeric state as zero, not as never-published', () => {
    // "0 days until deep clean" arrives as a SensorStateResponse with no
    // state field at all; dropping it hid every zero reading.
    assert.equal(coerceNumericState(undefined, undefined), 0);
  });

  it('passes present numeric states through, including NaN', () => {
    assert.equal(coerceNumericState(3.5, undefined), 3.5);
    assert.equal(coerceNumericState(-2, false), -2);
    assert.ok(Number.isNaN(coerceNumericState(Number.NaN, undefined)));
  });

  it('reads missing_state as unknown even when a value tagged along', () => {
    assert.ok(Number.isNaN(coerceNumericState(0, true)));
    assert.ok(Number.isNaN(coerceNumericState(undefined, true)));
  });

  it('reads an absent boolean state as false', () => {
    assert.equal(coerceBooleanState(undefined, undefined), false);
    assert.equal(coerceBooleanState(true, undefined), true);
  });

  it('keeps unknown booleans unknown rather than inventing false', () => {
    assert.equal(coerceBooleanState(undefined, true), undefined);
  });
});
