import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';
import { LabeledSwitchField } from './shared/LabeledSwitchField';
import { DeviceSummary } from './shared/DeviceSummary';
import { mergeDiscoveredConfig } from '../wizardUtils';
import type { RegisterDeviceFormProps } from './types';

interface DefaultFormValues {
  name: string;
  apiKey: string;
  visitAnnotationEnabled: boolean;
}

/**
 * Canonical registration form for a device the user picked from the discovery
 * list. Other provider flows can delegate to this when they have no fields of
 * their own beyond name, API key, and the visit annotation toggle.
 */
export const DefaultRegisterDeviceForm: React.FC<RegisterDeviceFormProps> = ({
  account,
  prefill,
  isSubmitting,
  serverError,
  onSubmitDevice,
  onBack,
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit, control } = useForm<DefaultFormValues>({
    defaultValues: {
      name: prefill?.name ?? '',
      apiKey: '',
      visitAnnotationEnabled: false,
    },
  });

  if (!prefill) {
    return null;
  }

  const onSubmit = handleSubmit(async (data) => {
    await onSubmitDevice({
      provider_account_id: account.id,
      external_id: prefill.externalId,
      name: data.name,
      type: prefill.type,
      config: mergeDiscoveredConfig(prefill.config, {
        encryptionKey: data.apiKey || undefined,
        visit_annotation_enabled: data.visitAnnotationEnabled,
      }),
    });
  });

  return (
    <>
      <p className="step-description">
        {t('settings.confirm_device_details')}
      </p>

      <form onSubmit={onSubmit} className="settings-form">
        <FormField label={t('settings.device_name_label')}>
          <Input {...register('name', { required: true })} />
        </FormField>

        <FormField label={t('settings.api_key_label')}>
          <Input
            type="password"
            placeholder={t('settings.api_key_placeholder')}
            {...register('apiKey')}
          />
        </FormField>

        <DeviceSummary type={prefill.type} externalId={prefill.externalId} />

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
    </>
  );
};
