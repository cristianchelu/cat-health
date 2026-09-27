import type { ActionControl, ControlOption } from 'shared';

/**
 * What running an action asks for first: nothing, one choice from a list, or
 * arguments a tile has no way to collect.
 */
export type ActionInput =
  | { kind: 'none' }
  | { kind: 'choice'; arg: string; options: ControlOption[] }
  | { kind: 'unsupported' };

export function actionInput(action: ActionControl): ActionInput {
  const args = Object.entries(action.args);
  if (args.length === 0) return { kind: 'none' };
  const [[arg, type]] = args;
  return args.length === 1 && type.kind === 'enum'
    ? { kind: 'choice', arg, options: type.options }
    : { kind: 'unsupported' };
}
