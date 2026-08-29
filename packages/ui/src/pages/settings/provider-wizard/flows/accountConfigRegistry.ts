import type { ProviderAccountConfigModule } from './accountConfigTypes.ts';
import { genericAccountConfig } from './genericAccountConfig.tsx';
import { SurePetAccountFields } from './surepet/SurePetAccountFields.tsx';
import {
  surepetDefaultConfigValues,
  surepetToConfig,
  surepetToFormValues,
} from './surepet/surepetAccountConfig.ts';
import { InferenceAccountFields } from './inference/InferenceAccountFields.tsx';
import {
  inferenceDefaultConfigValues,
  inferenceToConfig,
  inferenceToFormValues,
} from './inference/inferenceAccountConfig.ts';

/**
 * Per-provider account settings, keyed by provider name — the same shape as
 * `flows/registry.ts` for device registration.
 *
 * Generic surfaces call `getAccountConfigModule()` and never name a provider,
 * which is what AGENTS.md requires of anything outside `flows/<provider>/`.
 */
const surepetAccountConfig: ProviderAccountConfigModule = {
  defaultConfigValues: surepetDefaultConfigValues,
  toFormValues: surepetToFormValues,
  toConfig: surepetToConfig,
  Fields: SurePetAccountFields,
  note: { i18nKey: 'settings.surepet_unofficial_note', tone: 'warning' },
};

const inferenceAccountConfig: ProviderAccountConfigModule = {
  defaultConfigValues: inferenceDefaultConfigValues,
  toFormValues: inferenceToFormValues,
  toConfig: inferenceToConfig,
  Fields: InferenceAccountFields,
};

const ACCOUNT_CONFIG_MODULES: Record<string, ProviderAccountConfigModule> = {
  surepet: surepetAccountConfig,
  inference: inferenceAccountConfig,
};

/** Always returns a usable module; unknown providers get the generic fallback. */
export function getAccountConfigModule(
  provider: string,
): ProviderAccountConfigModule {
  return ACCOUNT_CONFIG_MODULES[provider] ?? genericAccountConfig;
}

/**
 * Whether a provider has a purpose-built connect form. The connect picker only
 * offers providers that do — there is no generic "paste some JSON" path any more.
 */
export function hasAccountConfigModule(provider: string): boolean {
  return provider in ACCOUNT_CONFIG_MODULES;
}
