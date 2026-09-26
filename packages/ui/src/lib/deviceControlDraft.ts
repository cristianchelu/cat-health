import {
  isRecord,
  type CompartmentField,
  type ControlValueType,
  type SettingControl,
} from 'shared';
import { roundEntityNumericValue } from '@/lib/formatSensorNumericDisplay';

type CompartmentsType = Extract<ControlValueType, { kind: 'compartments' }>;

/**
 * One compartment as its fields hold it: a number as text, a food as its id
 * or null.
 */
export type CompartmentDraft = Partial<
  Record<CompartmentField, string | number | null>
>;

export interface CompartmentsDraft {
  layout: string;
  compartments: CompartmentDraft[];
}

/**
 * A setting as its field holds it: the text of a number or an option, a
 * switch's state, or a compartmented layout. Text lets a number be half-typed
 * without being coerced.
 */
export type ControlDraftValue = string | boolean | CompartmentsDraft;

export const isCompartmentsDraft = (
  value: ControlDraftValue | undefined,
): value is CompartmentsDraft => isRecord(value);

function numberDraft(
  type: { step?: number; unit?: string },
  value: unknown,
): string {
  // Devices store floats, so 0.1 arrives as 0.10000000149; the step says how
  // many of those digits are real.
  return typeof value === 'number' && Number.isFinite(value)
    ? String(
        roundEntityNumericValue(value, { step: type.step, unit: type.unit }),
      )
    : '';
}

function numberValue(draft: unknown): number | undefined {
  if (typeof draft !== 'string' || draft.trim() === '') return undefined;
  const value = Number(draft);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * The compartments `layout` has, keeping what the draft already holds for the
 * ones that remain, so switching layouts back and forth loses nothing.
 */
export function resizeCompartments(
  type: CompartmentsType,
  draft: CompartmentsDraft,
  layout: string,
): CompartmentsDraft {
  const target = type.layouts.find((option) => option.value === layout);
  if (!target) return draft;
  return {
    layout,
    compartments: target.compartments.map(
      (_, index) =>
        draft.compartments[index] ??
        Object.fromEntries(
          Object.entries(target.fields).map(([name, field]) => [
            name,
            field.type.kind === 'food' ? null : '',
          ]),
        ),
    ),
  };
}

function compartmentsDraft(
  type: CompartmentsType,
  value: unknown,
): CompartmentsDraft {
  const layout = isRecord(value)
    ? type.layouts.find((option) => option.value === value.layout)
    : undefined;
  if (!layout || !isRecord(value) || !Array.isArray(value.compartments)) {
    const first = type.layouts[0];
    return first
      ? resizeCompartments(type, { layout: '', compartments: [] }, first.value)
      : { layout: '', compartments: [] };
  }
  const compartments: unknown[] = value.compartments;
  return {
    layout: layout.value,
    compartments: layout.compartments.map((_, index) => {
      const stored = compartments[index];
      return Object.fromEntries(
        Object.entries(layout.fields).map(([name, field]) => {
          const raw = isRecord(stored) ? stored[name] : undefined;
          return [
            name,
            field.type.kind === 'food'
              ? typeof raw === 'number'
                ? raw
                : null
              : numberDraft(field.type, raw),
          ];
        }),
      );
    }),
  };
}

function compartmentsValue(
  type: CompartmentsType,
  draft: ControlDraftValue,
): unknown {
  if (!isCompartmentsDraft(draft)) return undefined;
  const layout = type.layouts.find((option) => option.value === draft.layout);
  if (!layout) return undefined;
  const compartments = [];
  for (const compartment of draft.compartments) {
    const entry: Record<string, number | null> = {};
    for (const [name, field] of Object.entries(layout.fields)) {
      const raw = compartment[name as CompartmentField];
      if (field.type.kind === 'food') {
        entry[name] = typeof raw === 'number' ? raw : null;
      } else {
        const value = numberValue(raw);
        if (value === undefined) return undefined;
        entry[name] = value;
      }
    }
    compartments.push(entry);
  }
  return { layout: layout.value, compartments };
}

export type ControlDraft = Record<string, ControlDraftValue>;

export function toControlDraftValue(
  type: ControlValueType,
  value: unknown,
): ControlDraftValue {
  switch (type.kind) {
    case 'boolean':
      return value === true;
    case 'number':
      return numberDraft(type, value);
    case 'enum':
      return typeof value === 'string' ? value : '';
    case 'food':
      return typeof value === 'number' ? String(value) : '';
    case 'compartments':
      return compartmentsDraft(type, value);
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
    case 'number':
      return numberValue(draft);
    case 'enum':
      return typeof draft === 'string' && draft !== '' ? draft : undefined;
    case 'food':
      return typeof draft === 'string' && draft !== '' ? Number(draft) : null;
    case 'compartments':
      return compartmentsValue(type, draft);
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
    if (
      next === undefined ||
      JSON.stringify(next) === JSON.stringify(baseline[setting.key])
    ) {
      continue;
    }
    const value = fromControlDraftValue(setting.type, next);
    if (value === undefined) invalid.push(setting.key);
    else patch[setting.key] = value;
  }
  return { patch, invalid };
}
