import type { TFunction } from 'i18next';
import type {
  CompartmentField,
  CompartmentLayout,
  ControlLabel,
  ControlValueType,
} from 'shared';

type FieldType = CompartmentLayout['fields'][CompartmentField];

/** A compartmented layout with every label already in words. */
export interface ResolvedCompartmentLayout {
  value: string;
  label: string;
  compartments: string[];
  fields: Partial<
    Record<
      CompartmentField,
      { label: string; type: NonNullable<FieldType>['type'] }
    >
  >;
}

/** A control's value type with every label already in words. */
export type ResolvedControlType =
  | Exclude<ControlValueType, { kind: 'enum' | 'compartments' }>
  | { kind: 'enum'; options: { value: string; label: string }[] }
  | { kind: 'compartments'; layouts: ResolvedCompartmentLayout[] };

/** A known setting is labelled by the locale, a device key by the device. */
export function controlLabel(label: ControlLabel, t: TFunction): string {
  return 'i18n' in label ? t(label.i18n) : label.text;
}

/** The value types one tile can edit. */
export type TileValueType = Extract<
  ControlValueType,
  { kind: 'boolean' | 'number' | 'enum' }
>;

export const isTileValueType = (
  type: ControlValueType,
): type is TileValueType =>
  type.kind === 'boolean' || type.kind === 'number' || type.kind === 'enum';

export function resolveControlType(
  type: TileValueType,
  t: TFunction,
): Extract<ResolvedControlType, { kind: 'boolean' | 'number' | 'enum' }>;
export function resolveControlType(
  type: Extract<ControlValueType, { kind: 'compartments' }>,
  t: TFunction,
): Extract<ResolvedControlType, { kind: 'compartments' }>;
export function resolveControlType(
  type: ControlValueType,
  t: TFunction,
): ResolvedControlType;
export function resolveControlType(
  type: ControlValueType,
  t: TFunction,
): ResolvedControlType {
  switch (type.kind) {
    case 'enum':
      return {
        kind: 'enum',
        options: type.options.map((option) => ({
          value: option.value,
          label: controlLabel(option.label, t),
        })),
      };
    case 'compartments':
      return {
        kind: 'compartments',
        layouts: type.layouts.map((layout) => ({
          value: layout.value,
          label: controlLabel(layout.label, t),
          compartments: layout.compartments.map((label) =>
            controlLabel(label, t),
          ),
          fields: Object.fromEntries(
            Object.entries(layout.fields).map(([name, field]) => [
              name,
              { label: controlLabel(field.label, t), type: field.type },
            ]),
          ),
        })),
      };
    default:
      return type;
  }
}
