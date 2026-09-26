import type { ControlValueType } from 'shared';

/** Float slack for step alignment, so 0.1 + 0.2 still sits on a 0.1 step. */
const STEP_EPSILON = 1e-6;

/**
 * Why `value` does not fit `type`, or null when it does. The one check every
 * write passes before any provider sees it.
 */
export function validateControlValue(
  type: ControlValueType,
  value: unknown,
): string | null {
  switch (type.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 'must be a finite number';
      }
      if (type.min !== undefined && value < type.min) {
        return `must be at least ${type.min}`;
      }
      if (type.max !== undefined && value > type.max) {
        return `must be at most ${type.max}`;
      }
      if (type.step !== undefined && type.step > 0) {
        const steps = (value - (type.min ?? 0)) / type.step;
        if (Math.abs(steps - Math.round(steps)) > STEP_EPSILON) {
          return `must be a multiple of ${type.step}`;
        }
      }
      return null;
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false';
    case 'enum':
      return type.options.some((option) => option.value === value)
        ? null
        : `must be one of ${type.options.map((option) => option.value).join(', ')}`;
  }
}

/** Why `args` do not match an action's declared arguments, or null. */
export function validateActionArgs(
  declared: Record<string, ControlValueType>,
  args: Record<string, unknown>,
): string | null {
  for (const name of Object.keys(args)) {
    if (!(name in declared)) return `unexpected argument ${name}`;
  }
  for (const [name, type] of Object.entries(declared)) {
    if (!(name in args)) return `missing argument ${name}`;
    const problem = validateControlValue(type, args[name]);
    if (problem) return `${name} ${problem}`;
  }
  return null;
}
