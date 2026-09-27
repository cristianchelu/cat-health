import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProcedureDescriptor, ProcedureStep } from 'shared';
import { isProcedureRunnable, parseStepInputs } from '../procedureInputs';

const span: ProcedureStep = {
  key: 'span',
  instruction: { text: 'Place a known weight' },
  inputs: [
    {
      key: 'known_weight_g',
      label: { text: 'Known weight' },
      type: { kind: 'number', min: 1 },
    },
  ],
};

const procedure = (steps: ProcedureStep[]): ProcedureDescriptor => ({
  key: 'scale_calibration',
  label: { text: 'Calibrate' },
  steps,
  available: true,
  group: 'config',
});

describe('parseStepInputs', () => {
  it('reads each drafted input as a number', () => {
    assert.deepEqual(parseStepInputs(span, { known_weight_g: ' 5000 ' }), {
      known_weight_g: 5000,
    });
  });

  it('refuses an empty or non-numeric draft', () => {
    assert.equal(parseStepInputs(span, {}), null);
    assert.equal(parseStepInputs(span, { known_weight_g: 'abc' }), null);
  });
});

describe('isProcedureRunnable', () => {
  it('runs a procedure whose inputs are all numbers', () => {
    assert.equal(isProcedureRunnable(procedure([span])), true);
  });

  it('cannot run one asking for a kind the wizard does not collect', () => {
    const toggle: ProcedureStep = {
      ...span,
      inputs: [{ key: 'on', label: { text: 'On' }, type: { kind: 'boolean' } }],
    };
    assert.equal(isProcedureRunnable(procedure([toggle])), false);
  });
});
