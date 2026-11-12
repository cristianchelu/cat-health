import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Static, Type } from '@fastify/type-provider-typebox';
import { requireWithSchema } from 'shared';

import type { ProviderAccount } from '../../database/types/ProviderAccountTable.ts';

const AccountOverrideSchema = Type.Object(
  { config: Type.Record(Type.String(), Type.Unknown()) },
  { additionalProperties: false },
);
export type AccountOverride = Static<typeof AccountOverrideSchema>;

/** Keyed by provider account id. */
export const AccountOverridesSchema = Type.Record(
  Type.Integer(),
  AccountOverrideSchema,
  { additionalProperties: false },
);
export type AccountOverrides = Static<typeof AccountOverridesSchema>;

/**
 * Config this install runs its accounts with, read from the JSON file that
 * `ACCOUNT_OVERRIDES` names. It lives outside the database so a restored dump
 * never carries one host's connection settings, such as an MQTT client id,
 * onto another.
 */
export function loadAccountOverrides(
  env: NodeJS.ProcessEnv = process.env,
): AccountOverrides {
  const path = env.ACCOUNT_OVERRIDES;
  if (!path) return {};
  const json: unknown = JSON.parse(readFileSync(resolve(path), 'utf8'));
  return requireWithSchema(
    AccountOverridesSchema,
    json,
    `account overrides in ${path}`,
  );
}

/** The stored config with each overridden key replaced; the row itself is untouched. */
export function applyAccountOverride(
  account: ProviderAccount,
  override: AccountOverride,
): ProviderAccount {
  return { ...account, config: { ...account.config, ...override.config } };
}
