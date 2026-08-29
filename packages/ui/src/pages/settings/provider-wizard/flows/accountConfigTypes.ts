import type * as React from 'react';
import type { Control, FieldValues } from 'react-hook-form';
import type { CalloutTone } from '@/components/ui/Callout';

/**
 * Form shape shared by the connect step and the provider edit page.
 *
 * Provider fields register under `config.<key>`, so the shell owns `name` and
 * `enabled` while the provider module owns everything inside `config`.
 */
export interface ProviderAccountFormValues extends FieldValues {
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface ProviderAccountFieldsProps {
  control: Control<ProviderAccountFormValues>;
  /**
   * `connect` is a first-time setup; `edit` is an existing account. Providers
   * use this for things like autocomplete hints and help text.
   */
  mode: 'connect' | 'edit';
}

/**
 * How a provider contributes its account settings to the shared form.
 *
 * `Fields` is a real React component, deliberately not a field-descriptor DSL:
 * a declarative schema would be shorter for the two providers that exist today
 * and would immediately obstruct anything provider-specific — a region select,
 * a "test connection" button, conditional fields, bespoke validation. Providers
 * write ordinary JSX and may be as much of a snowflake as they need. What is
 * shared is shared by composition: `name`/`enabled` come from the shell, and
 * genuinely common fields become small components under `flows/shared/`.
 *
 * Since `config` and `runtime_state` were split server-side, `config` is
 * entirely user-owned — so `toConfig` builds it outright with no merge against
 * prior values and no preserve-unknown-keys rule.
 */
export interface ProviderAccountConfigModule {
  /** Values for a fresh connect. */
  defaultConfigValues: Record<string, unknown>;
  /**
   * Existing config → form values. Must never throw: accounts predating
   * validation can be missing fields and still have to open in the form.
   */
  toFormValues(config: unknown): Record<string, unknown>;
  /** Form values → the config to persist. */
  toConfig(values: Record<string, unknown>): Record<string, unknown>;
  /** Field block rendered inside the shared FormShell. Not a `<form>`. */
  Fields: React.FC<ProviderAccountFieldsProps>;
  /** Optional callout shown under the fields. */
  note?: { i18nKey: string; tone: CalloutTone };
}
