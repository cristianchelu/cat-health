import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';
import type { DeviceType } from 'shared';
import { LabeledSwitchField } from '../shared/LabeledSwitchField';
import type { RegisterDeviceFormProps } from '../types';

const DEFAULT_ESPHOME_PORT = 6053;

type EsphomeDirectFormProps = RegisterDeviceFormProps & {
  deviceType: DeviceType;
};

interface EsphomeDirectFormValues {
  name: string;
  host: string;
  port: string;
  apiKey: string;
  visitAnnotationEnabled: boolean;
}

/**
 * Shared body for direct (non-discovered) ESPHome registration. Used by the
 * typed Litterbox / Water Fountain wrappers so they only differ in the device
 * type they submit, not in field layout.
 */
export const EsphomeDirectForm: React.FC<EsphomeDirectFormProps> = ({
  account,
  deviceType,
  isSubmitting,
  serverError,
  onSubmitDevice,
  onBack,
}) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<EsphomeDirectFormValues>({
    defaultValues: {
      name: '',
      host: '',
      port: String(DEFAULT_ESPHOME_PORT),
      apiKey: '',
      visitAnnotationEnabled: false,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const trimmedHost = data.host.trim();
    const portStr = data.port.trim();
    const portValue = portStr === '' ? DEFAULT_ESPHOME_PORT : Number(portStr);

    await onSubmitDevice({
      provider_account_id: account.id,
      external_id: trimmedHost,
      name: data.name,
      type: deviceType,
      config: {
        host: trimmedHost,
        port: portValue,
        encryptionKey: data.apiKey.trim() || undefined,
        visit_annotation_enabled: data.visitAnnotationEnabled,
      },
    });
  });

  return (
    <form onSubmit={onSubmit} className="settings-form">
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
              value.trim().length > 0 || t('settings.esphome_host_required'),
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
  );
};
