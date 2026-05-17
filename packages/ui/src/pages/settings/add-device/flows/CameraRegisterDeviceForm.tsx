import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';
import { DefaultRegisterDeviceForm } from './DefaultRegisterDeviceForm';
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
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm<CameraDirectFormValues>({
    defaultValues: { name: '', snapshotUrl: '' },
  });

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

      <form onSubmit={onSubmit} className="settings-form">
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
