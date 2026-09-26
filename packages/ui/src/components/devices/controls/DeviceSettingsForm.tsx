import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { SettingControl } from 'shared';
import { deviceWriteErrorMessage } from '@/lib/deviceControlErrors';
import { useDraftForm } from '@/hooks/form';
import { useApplyDeviceSettings } from '@/hooks/queries/deviceQueries';
import {
  controlDraftBaseline,
  controlDraftPatch,
} from '@/lib/deviceControlDraft';
import { DeviceSettingsFormView } from './DeviceSettingsFormView';
import { DeviceSettingsSections } from './DeviceSettingsSections';

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

  return (
    <DeviceSettingsFormView
      className={className}
      grid={
        <DeviceSettingsSections
          settings={settings}
          draft={{ ...baseline, ...draft }}
          onChange={(key, value) => {
            setInvalidKeys((keys) => keys.filter((k) => k !== key));
            patchDraft({ [key]: value });
          }}
          invalidKeys={invalidKeys}
          disabled={apply.isPending}
        />
      }
      onSubmit={handleSubmit}
      onCancel={requestReset}
      isDirty={isDirty}
      isSaving={apply.isPending}
      error={
        apply.isError
          ? deviceWriteErrorMessage(
              apply.error,
              t,
              t('devices.controls.save_failed'),
            )
          : null
      }
      discardConfirm={discardConfirm}
      copy={{
        save: t('common.save'),
        cancel: t('common.cancel'),
      }}
    />
  );
};

export { DeviceSettingsForm, type DeviceSettingsFormProps };
