import { getStringValue, isRecord } from '@/lib/utils';

/**
 * Pure helpers for the inference (OpenAI-compatible) account config.
 * Provider-scoped: only provider modules may read account-config internals.
 */

export type InferenceConfigFormValues = {
  api_key: string;
  base_url: string;
};

export const inferenceDefaultConfigValues: InferenceConfigFormValues = {
  api_key: '',
  base_url: 'https://openrouter.ai/api/v1',
};

/** Never throws — a malformed config still has to open in the form. */
export function inferenceToFormValues(
  config: unknown,
): InferenceConfigFormValues {
  if (!isRecord(config)) return { ...inferenceDefaultConfigValues };
  return {
    api_key: getStringValue(config, 'api_key') ?? '',
    base_url: getStringValue(config, 'base_url') ?? '',
  };
}

export function inferenceToConfig(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return {
    api_key: (getStringValue(values, 'api_key') ?? '').trim(),
    base_url: (getStringValue(values, 'base_url') ?? '').trim(),
  };
}

/**
 * Short identity line for the providers listing. The host is the useful part —
 * an API key must never be displayed, even truncated.
 */
export function inferenceAccountIdentity(config: unknown): string | undefined {
  if (!isRecord(config)) return undefined;
  const baseUrl = getStringValue(config, 'base_url');
  if (!baseUrl) return undefined;
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}
