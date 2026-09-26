import type { ControlValueType, SettingControl } from 'shared';
import { roundEntityNumericValue } from '@/lib/formatSensorNumericDisplay';

/**
 * A setting as its field holds it: the text of a number or an option, or a
 * switch's state. Text lets a number be half-typed without being coerced.
 */
export type ControlDraftValue = string | boolean;

export type ControlDraft = Record<string, ControlDraftValue>;

export function toControlDraftValue(
  type: ControlValueType,
  value: unknown,
): ControlDraftValue {
  switch (type.kind) {
    case 'boolean':
      return value === true;
    case 'number':
      // Devices store floats, so 0.1 arrives as 0.10000000149; the step says
      // how many of those digits are real.
      return typeof value === 'number' && Number.isFinite(value)
        ? String(
            roundEntityNumericValue(value, {
              step: type.step,
              unit: type.unit,
            }),
          )
        : '';
    case 'enum':
      return typeof value === 'string' ? value : '';
  }
}

/** The value to send, or undefined when the field holds nothing sendable. */
export function fromControlDraftValue(
  type: ControlValueType,
  draft: ControlDraftValue,
): unknown {
  switch (type.kind) {
    case 'boolean':
      return draft === true;
    case 'number': {
      if (typeof draft !== 'string' || draft.trim() === '') return undefined;
      const value = Number(draft);
      return Number.isFinite(value) ? value : undefined;
    }
    case 'enum':
      return typeof draft === 'string' && draft !== '' ? draft : undefined;
  }
}

/** The draft each field starts from: what the device last reported. */
export function controlDraftBaseline(settings: SettingControl[]): ControlDraft {
  return Object.fromEntries(
    settings.map((setting) => [
      setting.key,
      toControlDraftValue(setting.type, setting.value),
    ]),
  );
}

/**
 * The patch a Save sends: only the fields that differ from the baseline.
 * `invalid` names the fields holding nothing sendable, which block the Save.
 */
export function controlDraftPatch(
  settings: SettingControl[],
  baseline: ControlDraft,
  draft: ControlDraft,
): { patch: Record<string, unknown>; invalid: string[] } {
  const patch: Record<string, unknown> = {};
  const invalid: string[] = [];
  for (const setting of settings) {
    const next = draft[setting.key];
    if (next === undefined || next === baseline[setting.key]) continue;
    const value = fromControlDraftValue(setting.type, next);
    if (value === undefined) invalid.push(setting.key);
    else patch[setting.key] = value;
  }
  return { patch, invalid };
}
