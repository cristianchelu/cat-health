import {
  ServiceArgType,
  type EspHomeClient,
  type ExecuteServiceArgumentValue,
  type ServiceArgument,
  type ServiceCallResult,
  type ServiceEntity,
} from 'esphome-client';
import type { ControlValueType, DeviceControlKey } from 'shared';

import type {
  Acceptance,
  ActionBinding,
  WriteChannel,
} from '../../control/types.ts';

/** One call to a user-defined action, with its arguments in declared order. */
export interface UserActionWrite {
  type: 'action';
  name: string;
  args: ExecuteServiceArgumentValue[];
}

/**
 * How long a call that asked for an answer waits for it. Just past the
 * device's own 30 s, after which it drops the call and never answers.
 */
export const USER_ACTION_ANSWER_TIMEOUT_MS = 35_000;

/** ESPHome `SupportsResponseType` none: the action never answers a call. */
const SUPPORTS_RESPONSE_NONE = 0;

/** Argument types a control can collect and validate; the rest have no value type. */
const ARG_VALUE_TYPES: Partial<Record<ServiceArgType, ControlValueType>> = {
  [ServiceArgType.BOOL]: { kind: 'boolean' },
  [ServiceArgType.INT]: { kind: 'number', step: 1 },
  [ServiceArgType.FLOAT]: { kind: 'number' },
};

function encodeArg(
  arg: ServiceArgument,
  value: unknown,
): ExecuteServiceArgumentValue {
  switch (arg.type) {
    case ServiceArgType.BOOL:
      return { boolValue: value === true };
    case ServiceArgType.INT:
      return { intValue: Number(value) };
    default:
      return { floatValue: Number(value) };
  }
}

/** `calibration_tare` → "Calibration tare": the name is all a listing carries. */
const labelOf = (name: string) => {
  const words = name.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * An action per user-defined action whose arguments all have a value type,
 * under `dev:action.<name>`. One taking a string or an array has nothing to
 * collect its arguments with, so it is left out.
 */
export function buildUserActionBindings<S>(
  services: Iterable<ServiceEntity>,
): ActionBinding<UserActionWrite, S>[] {
  const bindings: ActionBinding<UserActionWrite, S>[] = [];
  for (const service of services) {
    const args: Record<string, ControlValueType> = {};
    for (const arg of service.args) {
      const type = ARG_VALUE_TYPES[arg.type];
      if (type) args[arg.name] = type;
    }
    if (Object.keys(args).length !== service.args.length) continue;
    const key: DeviceControlKey = `dev:action.${service.name}`;
    bindings.push({
      key,
      descriptor: () => ({
        key,
        label: { text: labelOf(service.name) },
        args,
        // Firmware can do anything in an action, and says nothing about what.
        confirm: true,
        available: true,
        group: 'config',
      }),
      encode: (values) => [
        {
          type: 'action',
          name: service.name,
          args: service.args.map((arg) => encodeArg(arg, values[arg.name])),
        },
      ],
    });
  }
  return bindings;
}

type UserActionClient = Pick<EspHomeClient, 'on' | 'services'>;

/**
 * Calls user-defined actions. One that declares it answers is sent with a
 * call id and settles on the matching answer; one that does not is sent
 * without one and counts as applied once sent, as a button does.
 */
export function createUserActionChannel(
  client: UserActionClient,
  timeoutMs = USER_ACTION_ANSWER_TIMEOUT_MS,
): WriteChannel<UserActionWrite> {
  let lastCallId = 0;
  const nextCallId = () => {
    // A device tracks no call whose id is 0, so the counter skips it.
    lastCallId = (lastCallId % 0xffff_ffff) + 1;
    return lastCallId;
  };

  return {
    async submit(write): Promise<Acceptance<never>> {
      const service = client.services
        .list()
        .find((candidate) => candidate.name === write.name);
      if (!service) {
        return {
          status: 'failed',
          reason: 'rejected',
          message: `The device has no action ${write.name}`,
        };
      }
      if (service.supportsResponse === SUPPORTS_RESPONSE_NONE) {
        client.services.execute(service.key, write.args);
        return { status: 'applied' };
      }

      const callId = nextCallId();
      return new Promise<Acceptance<never>>((resolve) => {
        const settle = (acceptance: Acceptance<never>) => {
          clearTimeout(timer);
          answers[Symbol.dispose]();
          disconnects[Symbol.dispose]();
          resolve(acceptance);
        };
        const answers = client.on('serviceCallResult', (result) => {
          if (result.callId === callId) settle(acceptanceOf(result));
        });
        const disconnects = client.on('disconnect', () =>
          settle({ status: 'failed', reason: 'offline' }),
        );
        const timer = setTimeout(
          () =>
            settle({
              status: 'failed',
              reason: 'timeout',
              message: 'The device did not answer',
            }),
          timeoutMs,
        );
        client.services.execute(service.key, write.args, {
          callId,
          returnResponse: false,
        });
      });
    },
  };
}

function acceptanceOf(result: ServiceCallResult): Acceptance<never> {
  return result.success
    ? { status: 'applied' }
    : {
        status: 'failed',
        reason: 'rejected',
        message: result.errorMessage || undefined,
      };
}
