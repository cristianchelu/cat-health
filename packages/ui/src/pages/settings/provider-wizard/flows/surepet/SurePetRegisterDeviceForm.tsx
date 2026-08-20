import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FormField, FormShell, Input } from '@/components/ui/form';
import { useAppForm } from '@/hooks/form';
import { DeviceSummary } from '../../../components/DeviceSummary';
import { RegisterDeviceCard } from '../shared/RegisterDeviceCard';
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
  onCancel,
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { isDirty },
  } = useAppForm<SurePetFormValues>({
    defaultValues: {
      name: prefill?.name ?? '',
    },
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

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

      <FormShell
        onSubmit={onSubmit}
        error={serverError}
        actions={{
          onCancel,
          cancelLabel: t('settings.cancel'),
          submitLabel: isSubmitting
            ? t('settings.registering')
            : t('settings.register_device'),
          isSubmitting,
        }}
      >
        <RegisterDeviceCard
          account={account}
          prefill={prefill}
          type={prefill.type}
        >
          <FormField label={t('settings.device_name_label')}>
            <Input {...register('name', { required: true })} />
          </FormField>

          <DeviceSummary externalId={prefill.externalId} />
        </RegisterDeviceCard>
      </FormShell>
    </>
  );
};
