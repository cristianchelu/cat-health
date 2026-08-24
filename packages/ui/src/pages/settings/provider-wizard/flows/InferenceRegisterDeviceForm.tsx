import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FormField, FormShell, Input } from '@/components/ui/form';
import { useAppForm } from '@/hooks/form';
import { RegisterDeviceCard } from './shared/RegisterDeviceCard';
import { generateLocalExternalId } from '../wizardUtils';
import { getDeviceConfigModule } from './deviceConfigRegistry.ts';
import type { DeviceFormValues } from './deviceConfigTypes.ts';
import type { RegisterDeviceFormProps } from './types';

const configModule = getDeviceConfigModule('inference');

export const InferenceRegisterDeviceForm: React.FC<RegisterDeviceFormProps> = ({
  account,
  existingDevices,
  isSubmitting,
  serverError,
  onSubmitDevice,
  onCancel,
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  const {
    register,
    control,
    handleSubmit,
    formState: { isDirty },
  } = useAppForm<DeviceFormValues>({
    defaultValues: {
      name: '',
      enabled: true,
      visitAnnotationEnabled: false,
      config: { ...configModule.defaultConfigValues },
    },
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const onSubmit = handleSubmit(async (data) => {
    await onSubmitDevice({
      provider_account_id: account.id,
      external_id: generateLocalExternalId('recognizer'),
      name: data.name,
      type: 'pet_recognizer',
      config: {
        ...configModule.toConfig(data.config, {}),
        visit_annotation_enabled: false,
      },
    });
  });

  return (
    <>
      <p className="step-description">{t('settings.configure_recognizer')}</p>

      <FormShell
        onSubmit={onSubmit}
        error={serverError}
        actions={{
          onCancel,
          cancelLabel: t('settings.cancel'),
          submitLabel: isSubmitting
            ? t('settings.registering')
            : t('settings.create_recognizer'),
          isSubmitting,
        }}
      >
        <RegisterDeviceCard account={account} type="pet_recognizer">
          <FormField label={t('settings.recognizer_name_label')}>
            <Input
              placeholder={t('settings.recognizer_name_placeholder')}
              {...register('name', { required: true })}
            />
          </FormField>
          <configModule.Fields
            control={control}
            mode="register"
            existingDevices={existingDevices}
          />
        </RegisterDeviceCard>
      </FormShell>
    </>
  );
};
