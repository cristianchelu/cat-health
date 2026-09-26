import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { SettingControl } from 'shared';
import { deviceWriteErrorMessage } from '@/lib/deviceControlErrors';
import { useApplyDeviceSettings } from '@/hooks/queries/deviceQueries';
import {
  fromControlDraftValue,
  toControlDraftValue,
  type ControlDraftValue,
} from '@/lib/deviceControlDraft';
import {
  controlLabel,
  isTileValueType,
  resolveControlType,
} from '@/lib/deviceControlLabels';
import { ControlTiles, type ControlTileItem } from './ControlTiles';

interface DeviceLiveControlsProps {
  deviceId: number;
  settings: SettingControl[];
}

/**
 * Controls that operate the device now: each writes as soon as it is set,
 * with no draft and no Save. A tile shows what it was set to until the device
 * reports back, then what the device reports. Draws tiles for a grid the
 * caller owns.
 */
const DeviceLiveControls: React.FC<DeviceLiveControlsProps> = ({
  deviceId,
  settings,
}) => {
  const { t } = useTranslation();
  const apply = useApplyDeviceSettings(deviceId);
  const [edits, setEdits] = React.useState<Record<string, ControlDraftValue>>(
    {},
  );
  const [sending, setSending] = React.useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const forget = (key: string) => {
    setEdits(({ [key]: _, ...rest }) => rest);
    setSending((keys) => new Set([...keys].filter((k) => k !== key)));
  };

  const send = (setting: SettingControl, draft: ControlDraftValue) => {
    const { key } = setting;
    // A number commits on Enter and again on the blur that follows.
    if (sending.has(key)) return;
    const reported = toControlDraftValue(setting.type, setting.value);
    if (draft === reported) {
      forget(key);
      return;
    }
    const value = fromControlDraftValue(setting.type, draft);
    if (value === undefined) {
      setErrors((current) => ({
        ...current,
        [key]: t('devices.controls.invalid_value'),
      }));
      return;
    }
    setErrors(({ [key]: _, ...rest }) => rest);
    setSending((keys) => new Set(keys).add(key));
    // `mutateAsync`, not `mutate`: two tiles can be in flight at once, and
    // `mutate` only calls back for the latest call.
    apply
      .mutateAsync({ [key]: value })
      .catch((error: unknown) =>
        setErrors((current) => ({
          ...current,
          [key]: deviceWriteErrorMessage(
            error,
            t,
            t('devices.controls.save_failed'),
          ),
        })),
      )
      .finally(() => forget(key));
  };

  const byKey = new Map<string, SettingControl>(
    settings.map((setting) => [setting.key, setting]),
  );

  const items: ControlTileItem[] = settings
    .flatMap(({ type, ...setting }) =>
      isTileValueType(type) ? [{ ...setting, type }] : [],
    )
    .map((setting) => ({
      key: setting.key,
      label: controlLabel(setting.label, t),
      type: resolveControlType(setting.type, t),
      value:
        edits[setting.key] ?? toControlDraftValue(setting.type, setting.value),
      disabled: sending.has(setting.key),
      busyLabel: sending.has(setting.key)
        ? t('devices.controls.pending')
        : undefined,
      error: errors[setting.key],
    }));

  return (
    <ControlTiles
      items={items}
      onChange={(key, value) => {
        const setting = byKey.get(key);
        if (!setting) return;
        setEdits((current) => ({ ...current, [key]: value }));
        if (setting.type.kind !== 'number') send(setting, value);
      }}
      onCommit={(key) => {
        const setting = byKey.get(key);
        const draft = edits[key];
        if (setting && draft !== undefined) send(setting, draft);
      }}
    />
  );
};

export { DeviceLiveControls, type DeviceLiveControlsProps };
