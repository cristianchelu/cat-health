import type { TFunction } from 'i18next';
import type { SettingControl } from 'shared';
import type { ControlDraft } from '@/lib/deviceControlDraft';
import {
  controlLabel,
  isTileValueType,
  resolveControlType,
} from '@/lib/deviceControlLabels';
import type { ControlTileItem } from './ControlTiles';

/**
 * The single-value settings as the tiles of a draft form: the drafted value,
 * a spinner while the device has a write in flight, and why a field was
 * refused. Compartmented settings draw themselves.
 */
export function settingTileItems(
  settings: SettingControl[],
  draft: ControlDraft,
  options: { t: TFunction; invalidKeys: string[]; disabled: boolean },
): ControlTileItem[] {
  const { t, invalidKeys, disabled } = options;
  return settings
    .flatMap(({ type, ...setting }) =>
      isTileValueType(type) ? [{ ...setting, type }] : [],
    )
    .map((setting) => ({
      key: setting.key,
      label: controlLabel(setting.label, t),
      type: resolveControlType(setting.type, t),
      value: draft[setting.key] ?? '',
      disabled,
      busyLabel: setting.pending ? t('devices.controls.pending') : undefined,
      error: invalidKeys.includes(setting.key)
        ? t('devices.controls.invalid_value')
        : setting.failed
          ? t(`devices.controls.failed.${setting.failed.reason}`)
          : undefined,
    }));
}
