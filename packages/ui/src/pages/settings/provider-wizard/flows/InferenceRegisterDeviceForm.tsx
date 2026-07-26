import * as React from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormField,
  FormShell,
  Input,
  LabeledSwitchField,
  Select,
  Textarea,
} from '@/components/ui/form';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useAppForm } from '@/hooks/form';
import { generateLocalExternalId } from '../wizardUtils';
import type { RegisterDeviceFormProps } from './types';

const DEFAULT_PROMPT_TEMPLATE =
  "You are identifying cats. Here are reference photos:\n\n{{reference_images}}\n\nWho is the cat in this new image? Reply with ONLY the cat's name, or 'unknown'.";

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

interface InferenceFormValues {
  name: string;
  sourceDeviceId: string;
  model: string;
  promptTemplate: string;
  autoIdentify: boolean;
}

export const InferenceRegisterDeviceForm: React.FC<RegisterDeviceFormProps> = ({
  account,
  existingDevices,
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
    formState: { isDirty },
    requestDiscard,
    discardConfirm,
  } = useAppForm<InferenceFormValues>({
    defaultValues: {
      name: '',
      sourceDeviceId: '',
      model: DEFAULT_MODEL,
      promptTemplate: DEFAULT_PROMPT_TEMPLATE,
      autoIdentify: true,
    },
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const sourceOptions = existingDevices
    .filter((d) => d.type !== 'pet_recognizer')
    .map((d) => ({
      value: d.id.toString(),
      label: `${d.name} (${d.type})`,
    }));

  const onSubmit = handleSubmit(async (data) => {
    await onSubmitDevice({
      provider_account_id: account.id,
      external_id: generateLocalExternalId('recognizer'),
      name: data.name,
      type: 'pet_recognizer',
      config: {
        model: data.model,
        source_device_id: Number(data.sourceDeviceId),
        prompt_template: data.promptTemplate,
        auto_identify: data.autoIdentify,
        reference_images: {},
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
          onCancel: () => requestDiscard(onBack),
          cancelLabel: t('settings.back'),
          submitLabel: isSubmitting
            ? t('settings.registering')
            : t('settings.create_recognizer'),
          isSubmitting,
        }}
      >
        <FormField label={t('settings.recognizer_name_label')}>
          <Input
            placeholder={t('settings.recognizer_name_placeholder')}
            {...register('name', { required: true })}
          />
        </FormField>

        <FormField label={t('settings.source_device_label')}>
          <Select
            placeholder={t('settings.source_device_placeholder')}
            options={sourceOptions}
            {...register('sourceDeviceId', { required: true })}
          />
        </FormField>

        <FormField label={t('settings.model_label')}>
          <Input
            placeholder={t('settings.model_placeholder')}
            {...register('model', { required: true })}
          />
        </FormField>

        <FormField label={t('settings.prompt_template_label')}>
          <Textarea
            rows={6}
            {...register('promptTemplate', { required: true })}
          />
        </FormField>

        <FormField label={t('settings.auto_identify_label')}>
          <Controller
            name="autoIdentify"
            control={control}
            render={({ field }) => (
              <LabeledSwitchField
                checked={field.value}
                onCheckedChange={field.onChange}
                ref={field.ref}
              />
            )}
          />
        </FormField>
      </FormShell>
      <DiscardUnsavedDialog {...discardConfirm} />
    </>
  );
};
