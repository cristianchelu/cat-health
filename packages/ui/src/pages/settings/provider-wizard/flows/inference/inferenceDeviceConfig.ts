import { getBooleanValue, getStringValue, isRecord } from '@/lib/utils';

/**
 * Scene context, not instructions. The output contract lives in the server's
 * system message; repeating it here only creates something to contradict.
 */
export const DEFAULT_PROMPT_TEMPLATE = [
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
 * Vision-capable and cheap; the recognizer sends a handful of 256px thumbnails
 * per call. Successor to the `google/gemma-3-27b-it` this project has been
 * running.
 */
export const DEFAULT_MODEL = 'google/gemma-4-31b-it';

export type InferenceDeviceConfigFormValues = {
  source_device_id: string;
  model: string;
  prompt_template: string;
  auto_identify: boolean;
};

export const inferenceDefaultDeviceConfigValues: InferenceDeviceConfigFormValues =
  {
    source_device_id: '',
    model: DEFAULT_MODEL,
    prompt_template: DEFAULT_PROMPT_TEMPLATE,
    auto_identify: true,
  };

/** Never throws — a malformed config still has to open in the form. */
export function inferenceDeviceToFormValues(
  config: unknown,
): InferenceDeviceConfigFormValues {
  if (!isRecord(config)) return { ...inferenceDefaultDeviceConfigValues };
  const source = config.source_device_id;
  return {
    source_device_id: source != null && source !== '' ? String(source) : '',
    model: getStringValue(config, 'model') ?? DEFAULT_MODEL,
    prompt_template:
      getStringValue(config, 'prompt_template') ?? DEFAULT_PROMPT_TEMPLATE,
    auto_identify: getBooleanValue(config, 'auto_identify') !== false,
  };
}

export function inferenceDeviceToConfig(
  values: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const { visit_annotation_enabled: _visitAnnotation, ...rest } = existing;
  const source = getStringValue(values, 'source_device_id') ?? '';
  return {
    ...rest,
    model: getStringValue(values, 'model') ?? '',
    source_device_id: source ? Number(source) : null,
    prompt_template: getStringValue(values, 'prompt_template') ?? '',
    auto_identify: values.auto_identify !== false,
    reference_images: rest.reference_images ?? {},
  };
}
