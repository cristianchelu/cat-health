import * as React from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormField,
  FormShell,
  Input,
  LabeledSwitchField,
} from '@/components/ui/form';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useAppForm } from '@/hooks/form';
import type { DeviceType } from 'shared';
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
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
    requestDiscard,
    discardConfirm,
  } = useAppForm<EsphomeDirectFormValues>({
    defaultValues: {
      name: '',
      host: '',
      port: String(DEFAULT_ESPHOME_PORT),
      apiKey: '',
      visitAnnotationEnabled: false,
    },
  });

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
    <>
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
      </FormShell>
      <DiscardUnsavedDialog {...discardConfirm} />
    </>
  );
};
