import type { ActionKey, SettingKey } from 'shared';

import type {
  Acceptance,
  ActionBinding,
  Confirmer,
  ControlCommand,
  ControlSurface,
  SettingBinding,
  Settlement,
  Submission,
  WriteChannel,
} from './types.ts';

/**
 * Thrown by a binding's `encode` for a value that fits its descriptor but
 * turns out unwritable once looked up, so it fails as `invalid` rather than
 * as a fault.
 */
export class InvalidControlValueError extends Error {
  override name = 'InvalidControlValueError';
}

interface ControlSurfaceParts<W, S, R> {
  /** The provider's current state, handed to every binding. */
  state: () => S;
  settings?: readonly SettingBinding<W, S>[];
  actions?: readonly ActionBinding<W, S>[];
  channel: WriteChannel<W, R>;
  /** Required as soon as the channel can answer `pending`. */
  confirmer?: Confirmer<R>;
}

/**
 * Build a controller's `ControlSurface` from its provider's parts. The
 * composer owns key lookup and turning a command's writes into one
 * submission; a binding only knows its own key.
 */
export function composeControlSurface<W, S, R = never>(
  parts: ControlSurfaceParts<W, S, R>,
): ControlSurface {
  const settings = new Map<SettingKey, SettingBinding<W, S>>(
    (parts.settings ?? []).map((binding) => [binding.descriptor.key, binding]),
  );
  const actions = new Map<ActionKey, ActionBinding<W, S>>(
    (parts.actions ?? []).map((binding) => [binding.key, binding]),
  );

  const bindingFor = (command: ControlCommand) =>
    command.kind === 'setting'
      ? settings.get(command.key)
      : actions.get(command.key);

  const encode = async (command: ControlCommand): Promise<W[] | null> => {
    const state = parts.state();
    if (command.kind === 'setting') {
      return (
        (await settings.get(command.key)?.encode(command.value, state)) ?? null
      );
    }
    return actions.get(command.key)?.encode(command.args, state) ?? null;
  };

  const failure = (
    error: unknown,
  ): Extract<Settlement, { status: 'failed' }> => ({
    status: 'failed',
    reason: error instanceof InvalidControlValueError ? 'invalid' : 'unknown',
    message: error instanceof Error ? error.message : String(error),
  });

  /**
   * Send `writes` in order, stopping at the first refusal so a half-applied
   * command never looks like a whole one. A write the device has not
   * confirmed holds back the ones after it until it settles.
   */
  const run = async (writes: W[]): Promise<Submission> => {
    for (const [index, write] of writes.entries()) {
      let acceptance: Acceptance<R>;
      try {
        acceptance = await parts.channel.submit(write);
      } catch (error) {
        return failure(error);
      }
      if (acceptance.status === 'failed') return acceptance;
      if (acceptance.status === 'pending') {
        const { confirmer } = parts;
        if (!confirmer) {
          throw new Error('A channel answered pending with no confirmer');
        }
        const { ref } = acceptance;
        const rest = writes.slice(index + 1);
        return {
          status: 'pending',
          settle: async (signal): Promise<Settlement> => {
            const settlement = await confirmer.settle(ref, signal);
            if (settlement.status === 'failed' || rest.length === 0) {
              return settlement;
            }
            const next = await run(rest);
            return next.status === 'pending' ? next.settle(signal) : next;
          },
        };
      }
    }
    return { status: 'applied' };
  };

  return {
    manifest() {
      const state = parts.state();
      return {
        settings: [...settings.values()].map((binding) => binding.descriptor),
        actions: [...actions.values()].map((binding) =>
          binding.descriptor(state),
        ),
      };
    },

    readSettings() {
      const state = parts.state();
      return new Map(
        [...settings].map(([key, binding]) => [key, binding.read(state)]),
      );
    },

    validate(command) {
      if (command.kind !== 'setting') return null;
      return (
        settings.get(command.key)?.validate?.(command.value, parts.state()) ??
        null
      );
    },

    async submit(command): Promise<Submission> {
      if (!bindingFor(command)) {
        return {
          status: 'failed',
          reason: 'invalid',
          message: `Unknown ${command.kind} ${command.key}`,
        };
      }
      let writes: W[] | null;
      try {
        writes = await encode(command);
      } catch (error) {
        return failure(error);
      }
      return run(writes ?? []);
    },
  };
}
