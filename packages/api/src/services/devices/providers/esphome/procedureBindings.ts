import { ServiceArgType, type ServiceEntity } from 'esphome-client';
import type { ProcedureDescriptor } from 'shared';

import type { ProcedureBinding } from '../../control/types.ts';
import { answersCalls, type UserActionWrite } from './userActionControls.ts';

/** The two firmware actions a scale calibration is made of, zero then span. */
const ZERO_ACTION = 'calibration_tare';
const SPAN_ACTION = 'calibration_weight';

const takesOneFloat = (service: ServiceEntity) =>
  service.args.length === 1 && service.args[0].type === ServiceArgType.FLOAT;

const scaleCalibration: ProcedureDescriptor = {
  key: 'scale_calibration',
  label: { i18n: 'devices.controls.procedures.scale_calibration.title' },
  steps: [
    {
      key: 'zero',
      instruction: {
        i18n: 'devices.controls.procedures.scale_calibration.steps.zero',
      },
      inputs: [],
    },
    {
      key: 'span',
      instruction: {
        i18n: 'devices.controls.procedures.scale_calibration.steps.span',
      },
      inputs: [
        {
          key: 'known_weight_g',
          label: {
            i18n: 'devices.controls.procedures.scale_calibration.inputs.known_weight_g',
          },
          // The firmware's own known-weight number goes up to 40 kg in grams.
          type: { kind: 'number', min: 1, max: 40_000, step: 1, unit: 'g' },
        },
      ],
    },
  ],
  available: true,
  group: 'config',
};

/**
 * The known procedures a device's actions can carry, and the actions they
 * claim, which are then not offered on their own as well.
 */
export function buildProcedureBindings<S>(services: Iterable<ServiceEntity>): {
  procedures: ProcedureBinding<UserActionWrite, S>[];
  claimed: ReadonlySet<string>;
} {
  const byName = new Map(
    [...services].map((service) => [service.name, service]),
  );
  const zero = byName.get(ZERO_ACTION);
  const span = byName.get(SPAN_ACTION);
  // Each step has to be known to have ended before the next is offered, so
  // actions that never answer cannot carry a calibration.
  if (
    !zero ||
    !span ||
    !answersCalls(zero) ||
    !answersCalls(span) ||
    !takesOneFloat(span)
  ) {
    return { procedures: [], claimed: new Set() };
  }
  return {
    procedures: [
      {
        key: 'scale_calibration',
        descriptor: () => scaleCalibration,
        encode: (step, inputs) =>
          step === 'zero'
            ? [{ type: 'action', name: ZERO_ACTION, args: [] }]
            : [
                {
                  type: 'action',
                  name: SPAN_ACTION,
                  args: [{ floatValue: Number(inputs.known_weight_g) / 1000 }],
                },
              ],
      },
    ],
    claimed: new Set([ZERO_ACTION, SPAN_ACTION]),
  };
}
