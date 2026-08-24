import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FormInput } from '@/components/ui/form';
import type { DeviceConfigFieldsProps } from '../deviceConfigTypes.ts';

export const CameraDeviceFields: React.FC<DeviceConfigFieldsProps> = ({
  control,
}) => {
  const { t } = useTranslation();

  return (
    <FormInput
      name="config.snapshotUrl"
      control={control}
      label={t('settings.snapshot_url_label')}
      placeholder={t('settings.snapshot_url_placeholder')}
      description={t('settings.snapshot_url_help')}
      rules={{ required: true }}
    />
  );
};
