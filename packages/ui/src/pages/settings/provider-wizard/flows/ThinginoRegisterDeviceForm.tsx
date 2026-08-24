import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FormField, FormShell, Input } from '@/components/ui/form';
import { useAppForm } from '@/hooks/form';
import { RegisterDeviceCard } from './shared/RegisterDeviceCard';
import { generateLocalExternalId } from '../wizardUtils';
import { getStringValue, isRecord } from '@/lib/utils';
import type { RegisterDeviceFormProps } from './types';

interface ThinginoFormValues {
  name: string;
  origin: string;
  token: string;
}

function prefillOrigin(prefill: RegisterDeviceFormProps['prefill']): string {
  if (!prefill || !isRecord(prefill.config)) return '';
  return getStringValue(prefill.config, 'origin') ?? '';
}

export const ThinginoRegisterDeviceForm: React.FC<RegisterDeviceFormProps> = ({
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
  } = useAppForm<ThinginoFormValues>({
    defaultValues: {
      name: prefill?.name ?? '',
      origin: prefillOrigin(prefill),
      token: '',
    },
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const onSubmit = handleSubmit(async (data) => {
    await onSubmitDevice({
      provider_account_id: account.id,
      external_id: prefill?.externalId ?? generateLocalExternalId('manual'),
      name: data.name,
      type: 'camera',
      config: {
        origin: data.origin.trim(),
        token: data.token.trim(),
        visit_annotation_enabled: false,
      },
    });
  });

  return (
    <>
      <p className="step-description">{t('settings.manual_setup_desc')}</p>

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
        <RegisterDeviceCard account={account} type="camera">
          <FormField label={t('settings.device_name_label')}>
            <Input
              placeholder={t('settings.device_name_placeholder')}
              {...register('name', { required: true })}
            />
          </FormField>

          <FormField label={t('settings.camera_origin_label')}>
            <Input
              placeholder={t('settings.camera_origin_placeholder')}
              autoComplete="off"
              {...register('origin', { required: true })}
            />
          </FormField>

          <FormField label={t('settings.webui_api_key_label')}>
            <Input
              type="password"
              autoComplete="off"
              {...register('token', { required: true })}
            />
          </FormField>
        </RegisterDeviceCard>
      </FormShell>
    </>
  );
};
