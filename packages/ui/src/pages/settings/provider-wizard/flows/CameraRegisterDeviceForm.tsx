import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FormField, FormShell, Input } from '@/components/ui/form';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useAppForm } from '@/hooks/form';
import { DefaultRegisterDeviceForm } from './DefaultRegisterDeviceForm';
import { RegisterDeviceCard } from './shared/RegisterDeviceCard';
import { generateLocalExternalId } from '../wizardUtils';
import type { RegisterDeviceFormProps } from './types';

interface CameraDirectFormValues {
  name: string;
  snapshotUrl: string;
}

export const CameraRegisterDeviceForm: React.FC<RegisterDeviceFormProps> = (
  props,
) => {
  if (props.prefill) {
    return <DefaultRegisterDeviceForm {...props} />;
  }
  return <CameraDirectForm {...props} />;
};

const CameraDirectForm: React.FC<RegisterDeviceFormProps> = ({
  account,
  isSubmitting,
  serverError,
  onSubmitDevice,
  onBack,
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { isDirty },
    requestDiscard,
    discardConfirm,
  } = useAppForm<CameraDirectFormValues>({
    defaultValues: { name: '', snapshotUrl: '' },
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const onSubmit = handleSubmit(async (data) => {
    await onSubmitDevice({
      provider_account_id: account.id,
      external_id: generateLocalExternalId('manual'),
      name: data.name,
      type: 'camera',
      config: {
        snapshotUrl: data.snapshotUrl,
        visit_annotation_enabled: false,
      },
    });
  });

  return (
    <>
      <p className="step-description">{t('settings.manual_setup_desc')}</p>

      <RegisterDeviceCard account={account} type="camera">
        <FormShell
          onSubmit={onSubmit}
          error={serverError}
          actions={{
            onCancel: () => requestDiscard(onBack),
            cancelLabel: t('settings.back'),
            submitLabel: isSubmitting
              ? t('settings.registering')
              : t('settings.register_device'),
            isSubmitting,
          }}
        >
          <FormField label={t('settings.device_name_label')}>
            <Input
              placeholder={t('settings.device_name_placeholder')}
              {...register('name', { required: true })}
            />
          </FormField>

          <FormField label={t('settings.snapshot_url_label')}>
            <Input
              placeholder={t('settings.snapshot_url_placeholder')}
              {...register('snapshotUrl', { required: true })}
            />
            <p className="help-text">{t('settings.snapshot_url_help')}</p>
          </FormField>
        </FormShell>
      </RegisterDeviceCard>
      <DiscardUnsavedDialog {...discardConfirm} />
    </>
  );
};
