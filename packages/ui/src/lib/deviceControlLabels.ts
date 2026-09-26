import type { TFunction } from 'i18next';
import type { ControlLabel, ControlValueType } from 'shared';

/** A control's value type with every option's label already in words. */
export type ResolvedControlType =
  | Exclude<ControlValueType, { kind: 'enum' }>
  | { kind: 'enum'; options: { value: string; label: string }[] };

/** A known setting is labelled by the locale, a device key by the device. */
export function controlLabel(label: ControlLabel, t: TFunction): string {
  return 'i18n' in label ? t(label.i18n) : label.text;
}

export function resolveControlType(
  type: ControlValueType,
  t: TFunction,
): ResolvedControlType {
  return type.kind === 'enum'
    ? {
        kind: 'enum',
        options: type.options.map((option) => ({
          value: option.value,
          label: controlLabel(option.label, t),
        })),
      }
    : type;
}
