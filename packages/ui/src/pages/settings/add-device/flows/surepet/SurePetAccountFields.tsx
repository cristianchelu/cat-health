import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FormInput } from '@/components/ui/form';
import type { ProviderAccountFieldsProps } from '../accountConfigTypes.ts';

export const SurePetAccountFields: React.FC<ProviderAccountFieldsProps> = ({
  control,
  mode,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <FormInput
        name="config.email"
        control={control}
        type="email"
        autoComplete="username"
        label={t('settings.surepet_email_label')}
        placeholder={t('settings.surepet_email_placeholder')}
        rules={{ required: t('settings.surepet_email_required') }}
      />
      <FormInput
        name="config.password"
        control={control}
        type="password"
        autoComplete={mode === 'connect' ? 'new-password' : 'current-password'}
        label={t('settings.surepet_password_label')}
        placeholder={t('settings.surepet_password_placeholder')}
        rules={{ required: t('settings.surepet_password_required') }}
      />
    </>
  );
};
