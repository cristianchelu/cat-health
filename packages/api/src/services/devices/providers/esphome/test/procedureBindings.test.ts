import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceArgType, type ServiceEntity } from 'esphome-client';

import { buildProcedureBindings } from '../procedureBindings.ts';
import { buildUserActionBindings } from '../userActionControls.ts';

const action = (
  name: string,
  supportsResponse: ServiceEntity['supportsResponse'],
  args: ServiceEntity['args'] = [],
): ServiceEntity => ({ key: name.length, name, args, supportsResponse });

const knownWeight = [{ name: 'known_weight_kg', type: ServiceArgType.FLOAT }];
const tare = action('calibration_tare', 100);
const weigh = action('calibration_weight', 100, knownWeight);
const setCat = action('set_cat_weight', 0, [
  { name: 'cat', type: ServiceArgType.INT },
]);

describe('buildProcedureBindings', () => {
  it('offers a scale calibration made of the two calibration actions', () => {
    const { procedures, claimed } = buildProcedureBindings([
      tare,
      weigh,
      setCat,
    ]);

    assert.deepEqual(
      procedures.map((procedure) => procedure.key),
      ['scale_calibration'],
    );
    assert.deepEqual(
      procedures[0]
        .descriptor(undefined)
        .steps.map((step) => [step.key, step.inputs.map((input) => input.key)]),
      [
        ['zero', []],
        ['span', ['known_weight_g']],
      ],
    );
    assert.deepEqual(
      buildUserActionBindings([tare, weigh, setCat], claimed).map(
        (binding) => binding.key,
      ),
      ['dev:action.set_cat_weight'],
    );
  });

  it('zeroes, then weighs the known weight in kilograms', () => {
    const [calibration] = buildProcedureBindings([tare, weigh]).procedures;

    assert.deepEqual(calibration.encode('zero', {}, undefined), [
      { type: 'action', name: 'calibration_tare', args: [] },
    ]);
    assert.deepEqual(
      calibration.encode('span', { known_weight_g: 5000 }, undefined),
      [
        {
          type: 'action',
          name: 'calibration_weight',
          args: [{ floatValue: 5 }],
        },
      ],
    );
  });

  it('offers none when the actions do not answer, leaving them as actions', () => {
    const silent = [
      action('calibration_tare', 0),
      action('calibration_weight', 0, knownWeight),
    ];
    const { procedures, claimed } = buildProcedureBindings(silent);

    assert.deepEqual(procedures, []);
    assert.equal(buildUserActionBindings(silent, claimed).length, 2);
  });

  it('offers none when the firmware lacks either step', () => {
    assert.deepEqual(buildProcedureBindings([tare]).procedures, []);
    assert.deepEqual(buildProcedureBindings([weigh]).procedures, []);
  });
});
