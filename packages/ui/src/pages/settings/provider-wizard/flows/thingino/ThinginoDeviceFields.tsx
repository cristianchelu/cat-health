import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FormInput } from '@/components/ui/form';
import type { DeviceConfigFieldsProps } from '../deviceConfigTypes.ts';

export const ThinginoDeviceFields: React.FC<DeviceConfigFieldsProps> = ({
  control,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <FormInput
        name="config.origin"
        control={control}
        autoComplete="off"
        label={t('settings.camera_origin_label')}
        placeholder={t('settings.camera_origin_placeholder')}
        rules={{ required: true }}
      />
      <FormInput
        name="config.token"
        control={control}
        type="password"
        autoComplete="off"
        label={t('settings.webui_api_key_label')}
        rules={{ required: true }}
      />
    </>
  );
};
