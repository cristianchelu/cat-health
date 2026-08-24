import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FormField, FormShell, Input } from '@/components/ui/form';
import { useAppForm } from '@/hooks/form';
import { RegisterDeviceCard } from '../shared/RegisterDeviceCard';
import { generateLocalExternalId } from '../../wizardUtils';
import { getStringValue, isRecord } from '@/lib/utils';
import { getDeviceConfigModule } from '../deviceConfigRegistry.ts';
import type { DeviceFormValues } from '../deviceConfigTypes.ts';
import type { RegisterDeviceFormProps } from '../types';

const configModule = getDeviceConfigModule('thingino');

function prefillOrigin(prefill: RegisterDeviceFormProps['prefill']): string {
  if (!prefill || !isRecord(prefill.config)) return '';
  return getStringValue(prefill.config, 'origin') ?? '';
}

export const ThinginoRegisterDeviceForm: React.FC<RegisterDeviceFormProps> = ({
  account,
  prefill,
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
      name: prefill?.name ?? '',
      enabled: true,
      visitAnnotationEnabled: false,
      config: {
        ...configModule.defaultConfigValues,
        origin: prefillOrigin(prefill),
      },
    },
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const onSubmit = handleSubmit(async (data) => {
    const existing = isRecord(prefill?.config) ? prefill.config : {};
    await onSubmitDevice({
      provider_account_id: account.id,
      external_id: prefill?.externalId ?? generateLocalExternalId('manual'),
      name: data.name,
      type: 'camera',
      config: {
        ...configModule.toConfig(data.config, existing),
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
