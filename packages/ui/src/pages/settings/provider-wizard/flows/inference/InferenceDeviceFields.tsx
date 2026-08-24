import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  FormInput,
  FormSelect,
  FormSwitch,
  FormTextarea,
} from '@/components/ui/form';
import type { DeviceConfigFieldsProps } from '../deviceConfigTypes.ts';

export const InferenceDeviceFields: React.FC<DeviceConfigFieldsProps> = ({
  control,
  existingDevices,
  deviceId,
}) => {
  const { t } = useTranslation();
  const sourceOptions = existingDevices
    .filter(
      (device) => device.type !== 'pet_recognizer' && device.id !== deviceId,
    )
    .map((device) => ({
      value: device.id.toString(),
      label: `${device.name} (${device.type})`,
    }));

  return (
    <>
      <FormSelect
        name="config.source_device_id"
        control={control}
        label={t('settings.source_device_label')}
        placeholder={t('settings.source_device_placeholder')}
        options={sourceOptions}
        rules={{ required: true }}
      />
      <FormInput
        name="config.model"
        control={control}
        label={t('settings.model_label')}
        placeholder={t('settings.model_placeholder')}
        rules={{ required: true }}
      />
      <FormTextarea
        name="config.prompt_template"
        control={control}
        label={t('settings.prompt_template_label')}
        description={t('settings.prompt_template_help')}
        rows={8}
        rules={{ required: true }}
      />
      <FormSwitch
        name="config.auto_identify"
        control={control}
        label={t('settings.auto_identify_label')}
      />
    </>
  );
};
