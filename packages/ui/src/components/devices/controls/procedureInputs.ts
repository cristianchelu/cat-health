import type { ProcedureDescriptor, ProcedureStep } from 'shared';

/** Whether every step's inputs are numbers, the only kind the wizard collects. */
export const isProcedureRunnable = (procedure: ProcedureDescriptor): boolean =>
  procedure.steps.every((step) =>
    step.inputs.every((input) => input.type.kind === 'number'),
  );

/**
 * A step's drafted inputs as the numbers it takes, or null when one is empty
 * or not a number. Bounds are the API's to check.
 */
export function parseStepInputs(
  step: ProcedureStep,
  drafts: Readonly<Record<string, string>>,
): Record<string, number> | null {
  const values: Record<string, number> = {};
  for (const input of step.inputs) {
    const draft = drafts[input.key]?.trim() ?? '';
    const value = Number(draft);
    if (draft === '' || !Number.isFinite(value)) return null;
    values[input.key] = value;
  }
  return values;
}
