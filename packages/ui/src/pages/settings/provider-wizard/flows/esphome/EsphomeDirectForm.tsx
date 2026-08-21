import * as React from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormField,
  FormShell,
  Input,
  LabeledSwitchField,
  Select,
} from '@/components/ui/form';
import { useAppForm } from '@/hooks/form';
import type { DeviceType } from 'shared';
import { RegisterDeviceCard } from '../shared/RegisterDeviceCard';
import type { RegisterDeviceFormProps } from '../types';

const DEFAULT_ESPHOME_PORT = 6053;

type EsphomeDeviceType = Extract<DeviceType, 'litterbox' | 'water_fountain'>;

const ESPHOME_DEFAULT_TYPE: EsphomeDeviceType = 'litterbox';

interface EsphomeDirectFormValues {
  deviceType: EsphomeDeviceType;
  name: string;
  host: string;
  port: string;
  apiKey: string;
  visitAnnotationEnabled: boolean;
}

/**
 * Direct (non-discovered) ESPHome registration.
 *
 * ESPHome is a LAN provider with no catalog, so the device type is something
 * the user declares rather than something discovery reports — it is a field of
 * this form like any other, and it retitles the card as it changes.
 */
export const EsphomeDirectForm: React.FC<RegisterDeviceFormProps> = ({
  account,
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
    control,
    formState: { errors, isDirty },
  } = useAppForm<EsphomeDirectFormValues>({
    defaultValues: {
      deviceType: ESPHOME_DEFAULT_TYPE,
      name: '',
      host: '',
      port: String(DEFAULT_ESPHOME_PORT),
      apiKey: '',
      visitAnnotationEnabled: false,
    },
  });

  const deviceType = useWatch({ control, name: 'deviceType' });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const onSubmit = handleSubmit(async (data) => {
    const trimmedHost = data.host.trim();
    const portStr = data.port.trim();
    const portValue = portStr === '' ? DEFAULT_ESPHOME_PORT : Number(portStr);

    await onSubmitDevice({
      provider_account_id: account.id,
      external_id: trimmedHost,
      name: data.name,
      type: data.deviceType,
      config: {
        host: trimmedHost,
        port: portValue,
        encryptionKey: data.apiKey.trim() || undefined,
        visit_annotation_enabled: data.visitAnnotationEnabled,
      },
    });
  });

  return (
    <>
      <p className="step-description">
        {t('settings.manual_setup_desc_esphome')}
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
        <RegisterDeviceCard account={account} type={deviceType}>
          <FormField label={t('settings.esphome_device_type_label')}>
            <Select
              options={[
                { value: 'litterbox', label: t('device_types.litterbox') },
                {
                  value: 'water_fountain',
                  label: t('device_types.water_fountain'),
                },
              ]}
              {...register('deviceType')}
            />
          </FormField>

          <FormField label={t('settings.device_name_label')}>
            <Input
              placeholder={t('settings.esphome_device_name_placeholder')}
              {...register('name', { required: true })}
            />
          </FormField>

          <FormField
            label={t('settings.esphome_host_label')}
            error={errors.host?.message}
          >
            <Input
              placeholder={t('settings.esphome_host_placeholder')}
              autoComplete="off"
              {...register('host', {
                validate: (value) =>
                  value.trim().length > 0 ||
                  t('settings.esphome_host_required'),
              })}
            />
            <p className="help-text">{t('settings.esphome_host_help')}</p>
          </FormField>

          <FormField
            label={t('settings.esphome_port_label')}
            error={errors.port?.message}
          >
            <Input
              placeholder={t('settings.esphome_port_placeholder')}
              inputMode="numeric"
              {...register('port', {
                validate: (value) => {
                  const trimmed = value.trim();
                  const port =
                    trimmed === '' ? DEFAULT_ESPHOME_PORT : Number(trimmed);
                  if (!Number.isFinite(port) || port < 1 || port > 65535) {
                    return t('settings.esphome_port_invalid');
                  }
                  return true;
                },
              })}
            />
          </FormField>

          <FormField label={t('settings.api_key_label')}>
            <Input
              type="password"
              placeholder={t('settings.api_key_placeholder')}
              {...register('apiKey')}
            />
          </FormField>

          <FormField label={t('settings.visit_annotation_label')}>
            <Controller
              name="visitAnnotationEnabled"
              control={control}
              render={({ field }) => (
                <LabeledSwitchField
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  ref={field.ref}
                />
              )}
            />
            <p className="help-text">{t('settings.visit_annotation_help')}</p>
          </FormField>
        </RegisterDeviceCard>
      </FormShell>
    </>
  );
};
