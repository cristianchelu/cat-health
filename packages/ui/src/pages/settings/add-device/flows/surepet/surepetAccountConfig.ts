import { getStringValue, isRecord } from '@/lib/utils';

/**
 * Pure helpers for the SurePet account config. Provider-scoped by design:
 * per AGENTS.md only provider modules may read account-config internals.
 *
 * Since `config` and `runtime_state` were split, this file deals exclusively
 * with user-supplied values — credentials and pet links. Tokens, household ids
 * and sync cursors live server-side and never reach the client.
 */

export type SurePetConfigFormValues = {
  email: string;
  password: string;
};

export const surepetDefaultConfigValues: SurePetConfigFormValues = {
  email: '',
  password: '',
};

/**
 * Never throws. Accounts predating validation can be missing a password, and
 * they still have to open in the form rather than blowing up the page.
 */
export function surepetToFormValues(config: unknown): SurePetConfigFormValues {
  if (!isRecord(config)) return { ...surepetDefaultConfigValues };
  return {
    email: getStringValue(config, 'email') ?? '',
    password: getStringValue(config, 'password') ?? '',
  };
}

export function surepetToConfig(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return {
    email: (getStringValue(values, 'email') ?? '').trim(),
    password: getStringValue(values, 'password') ?? '',
  };
}

/** Short identity line for the providers listing. */
export function surepetAccountIdentity(config: unknown): string | undefined {
  if (!isRecord(config)) return undefined;
  return getStringValue(config, 'email') || undefined;
}
