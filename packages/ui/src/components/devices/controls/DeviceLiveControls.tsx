import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { SettingControl } from 'shared';
import { apiErrorMessage } from '@/api/apiClient';
import { useApplyDeviceSettings } from '@/hooks/queries/deviceQueries';
import {
  fromControlDraftValue,
  toControlDraftValue,
  type ControlDraftValue,
} from '@/lib/deviceControlDraft';
import { ControlTileGrid, type ControlTileGridItem } from './ControlTileGrid';

interface DeviceLiveControlsProps {
  deviceId: number;
  settings: SettingControl[];
  className?: string;
}

/**
 * Controls that operate the device now: each writes as soon as it is set,
 * with no draft and no Save. A tile shows what it was set to until the device
 * reports back, then what the device reports.
 */
const DeviceLiveControls: React.FC<DeviceLiveControlsProps> = ({
  deviceId,
  settings,
  className,
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
          [key]: apiErrorMessage(error, t('devices.controls.save_failed')),
        })),
      )
      .finally(() => forget(key));
  };

  const byKey = new Map<string, SettingControl>(
    settings.map((setting) => [setting.key, setting]),
  );

  const items: ControlTileGridItem[] = settings.map((setting) => ({
    key: setting.key,
    label: setting.label.text,
    type: setting.type,
    value:
      edits[setting.key] ?? toControlDraftValue(setting.type, setting.value),
    disabled: sending.has(setting.key),
    note:
      setting.pending || sending.has(setting.key)
        ? t('devices.controls.pending')
        : undefined,
    error:
      errors[setting.key] ??
      (setting.failed
        ? t(`devices.controls.failed.${setting.failed.reason}`)
        : undefined),
  }));

  return (
    <ControlTileGrid
      className={className}
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
