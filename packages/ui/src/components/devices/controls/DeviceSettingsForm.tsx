import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { SettingControl } from 'shared';
import { apiErrorMessage } from '@/api/apiClient';
import { useDraftForm } from '@/hooks/form';
import { useApplyDeviceSettings } from '@/hooks/queries/deviceQueries';
import {
  controlDraftBaseline,
  controlDraftPatch,
} from '@/lib/deviceControlDraft';
import type { ControlTileItem } from './ControlTiles';
import { DeviceSettingsFormView } from './DeviceSettingsFormView';

interface DeviceSettingsFormProps {
  deviceId: number;
  settings: SettingControl[];
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
}

/** Drafts a device's settings locally and sends the changed ones on Save. */
const DeviceSettingsForm: React.FC<DeviceSettingsFormProps> = ({
  deviceId,
  settings,
  onDirtyChange,
  className,
}) => {
  const { t } = useTranslation();
  const apply = useApplyDeviceSettings(deviceId);
  const [invalidKeys, setInvalidKeys] = React.useState<string[]>([]);

  const baseline = React.useMemo(
    () => controlDraftBaseline(settings),
    [settings],
  );
  const { draft, patchDraft, isDirty, commit, requestReset, discardConfirm } =
    useDraftForm(baseline, { baselineKey: JSON.stringify(baseline) });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { patch, invalid } = controlDraftPatch(settings, baseline, draft);
    setInvalidKeys(invalid);
    if (invalid.length > 0 || Object.keys(patch).length === 0) return;
    apply.mutate(patch, { onSuccess: () => commit() });
  };

  const items: ControlTileItem[] = settings.map((setting) => ({
    key: setting.key,
    label: setting.label.text,
    type: setting.type,
    value: draft[setting.key] ?? baseline[setting.key] ?? '',
    disabled: apply.isPending,
    busyLabel: setting.pending ? t('devices.controls.pending') : undefined,
    error: invalidKeys.includes(setting.key)
      ? t('devices.controls.invalid_value')
      : setting.failed
        ? t(`devices.controls.failed.${setting.failed.reason}`)
        : undefined,
  }));

  return (
    <DeviceSettingsFormView
      className={className}
      items={items}
      onFieldChange={(key, value) => {
        setInvalidKeys((keys) => keys.filter((k) => k !== key));
        patchDraft({ [key]: value });
      }}
      onSubmit={handleSubmit}
      onCancel={requestReset}
      isDirty={isDirty}
      isSaving={apply.isPending}
      error={
        apply.isError
          ? apiErrorMessage(apply.error, t('devices.controls.save_failed'))
          : null
      }
      discardConfirm={discardConfirm}
      copy={{
        title: t('devices.controls.settings_title'),
        save: t('common.save'),
        cancel: t('common.cancel'),
      }}
    />
  );
};

export { DeviceSettingsForm, type DeviceSettingsFormProps };
