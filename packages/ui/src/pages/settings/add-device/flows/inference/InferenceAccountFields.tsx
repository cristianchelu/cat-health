import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FormInput } from '@/components/ui/form';
import type { ProviderAccountFieldsProps } from '../accountConfigTypes.ts';

export const InferenceAccountFields: React.FC<ProviderAccountFieldsProps> = ({
  control,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <FormInput
        name="config.base_url"
        control={control}
        type="url"
        label={t('settings.inference_base_url_label')}
        placeholder={t('settings.inference_base_url_placeholder')}
        rules={{
          required: t('settings.inference_base_url_required'),
          validate: (value: unknown) => {
            try {
              new URL(String(value));
              return true;
            } catch {
              return t('settings.inference_base_url_invalid');
            }
          },
        }}
      />
      <FormInput
        name="config.api_key"
        control={control}
        type="password"
        autoComplete="off"
        label={t('settings.inference_api_key_label')}
        placeholder={t('settings.inference_api_key_placeholder')}
        rules={{ required: t('settings.inference_api_key_required') }}
      />
    </>
  );
};
