import type { ActionKey, SettingKey } from 'shared';

import type {
  ActionBinding,
  Confirmer,
  ControlCommand,
  ControlSurface,
  SettingBinding,
  Settlement,
  Submission,
  WriteChannel,
} from './types.ts';

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

  const encode = (command: ControlCommand): W[] | null => {
    const state = parts.state();
    if (command.kind === 'setting') {
      return settings.get(command.key)?.encode(command.value, state) ?? null;
    }
    return actions.get(command.key)?.encode(command.args, state) ?? null;
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

    async submit(command): Promise<Submission> {
      const writes = encode(command);
      if (writes === null) {
        return {
          status: 'failed',
          reason: 'invalid',
          message: `Unknown ${command.kind} ${command.key}`,
        };
      }

      // A command's writes go out in order and stop at the first refusal, so
      // a half-applied command never looks like a whole one.
      const refs: R[] = [];
      for (const write of writes) {
        let acceptance;
        try {
          acceptance = await parts.channel.submit(write);
        } catch (error) {
          return {
            status: 'failed',
            reason: 'unknown',
            message: error instanceof Error ? error.message : String(error),
          };
        }
        if (acceptance.status === 'failed') return acceptance;
        if (acceptance.status === 'pending') refs.push(acceptance.ref);
      }

      if (refs.length === 0) return { status: 'applied' };

      const { confirmer } = parts;
      if (!confirmer) {
        throw new Error('A channel answered pending with no confirmer');
      }
      return {
        status: 'pending',
        settle: async (signal): Promise<Settlement> => {
          const settlements = await Promise.all(
            refs.map((ref) => confirmer.settle(ref, signal)),
          );
          return (
            settlements.find(
              (settlement) => settlement.status === 'failed',
            ) ?? { status: 'applied' }
          );
        },
      };
    },
  };
}
