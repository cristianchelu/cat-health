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
import { useAppForm } from '@/hooks/form';
import { RegisterDeviceCard } from './shared/RegisterDeviceCard';
import { generateLocalExternalId } from '../wizardUtils';
import type { RegisterDeviceFormProps } from './types';

/**
 * Scene context, not instructions.
 *
 * The output contract — one word, the cause vocabulary, when to abstain — lives
 * in the server's system message, so it is versioned with the code and reaches
 * every device. Repeating any of it here only creates something to contradict,
 * and measurably did: an earlier instruction-shaped default scored worse than
 * naming the furniture.
 *
 * What belongs here is the part neither the code nor the model can know: what
 * this particular camera is looking at. Telling the model that the white
 * cylinder is a fountain and not a robot vacuum is what took recognition from
 * 24/39 to 39/39 on real captures.
 */
const DEFAULT_PROMPT_TEMPLATE = [
  'Describe what this camera sees, so the model can tell the animals apart from',
  'the surroundings. For example:',
  '',
  'This camera watches a pet water fountain in a hallway. The fountain is a',
  'white cylinder standing on tiled floor. It is equipment and is always in',
  'frame — it is never itself a cause, and it is not a robot vacuum.',
  '',
  'Pets that may appear here:',
  '{{reference_images}}',
].join('\n');

/**
 * Vision-capable and cheap ($0.09/$0.34 per 1M tokens); the recognizer sends a
 * handful of 256px thumbnails per call. Successor to the `google/gemma-3-27b-it`
 * this project has been running.
 */
const DEFAULT_MODEL = 'google/gemma-4-31b-it';

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
  onCancel,
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    control,
    formState: { isDirty },
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

          <FormField
            label={t('settings.prompt_template_label')}
            description={t('settings.prompt_template_help')}
          >
            <Textarea
              rows={8}
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
        </RegisterDeviceCard>
      </FormShell>
    </>
  );
};
