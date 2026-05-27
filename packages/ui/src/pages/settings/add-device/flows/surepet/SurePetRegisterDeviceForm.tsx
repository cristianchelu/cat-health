import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';
import { DeviceSummary } from '../shared/DeviceSummary';
import type { RegisterDeviceFormProps } from '../types';

interface SurePetFormValues {
  name: string;
}

export const SurePetRegisterDeviceForm: React.FC<RegisterDeviceFormProps> = ({
  account,
  prefill,
  isSubmitting,
  serverError,
  onSubmitDevice,
  onBack,
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm<SurePetFormValues>({
    defaultValues: {
      name: prefill?.name ?? '',
    },
  });

  if (!prefill) {
    return null;
  }

  const onSubmit = handleSubmit(async (data) => {
    await onSubmitDevice({
      provider_account_id: account.id,
      external_id: prefill.externalId,
      name: data.name.trim() || prefill.name,
      type: 'feeder',
      config: prefill.config,
    });
  });

  return (
    <>
      <p className="step-description">
        {t('settings.surepet_confirm_device_details')}
      </p>

      <form onSubmit={onSubmit} className="settings-form">
        <FormField label={t('settings.device_name_label')}>
          <Input {...register('name', { required: true })} />
        </FormField>

        <DeviceSummary type={prefill.type} externalId={prefill.externalId} />

        {serverError && <div className="error-message">{serverError}</div>}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onBack}>
            {t('settings.back')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <Check size="1em" />
            {isSubmitting
              ? t('settings.registering')
              : t('settings.register_device')}
          </Button>
        </div>
      </form>
    </>
  );
};
