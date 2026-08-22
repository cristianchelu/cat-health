import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ProviderNote } from '@/pages/settings/components/ProviderNote';
import type {
  ProviderAccountConfigModule,
  ProviderAccountFieldsProps,
} from './accountConfigTypes.ts';

/**
 * Fallback for providers with no connect form: `esphome`, `camera`, `thingino`,
 * and any other provider that stores `config = {}` because real settings live
 * on individual devices.
 *
 * There is genuinely nothing to edit here beyond the account name and enabled
 * flag that the shell already provides.
 *
 * This replaces the old raw-JSON textarea, and is strictly safer than it: that
 * textarea let a typo destroy a working account's config, whereas `toConfig`
 * here returns nothing at all and the page omits `config` from the request.
 */
const GenericAccountFields: React.FC<ProviderAccountFieldsProps> = () => {
  const { t } = useTranslation();

  return <ProviderNote>{t('settings.no_configurable_settings')}</ProviderNote>;
};

export const genericAccountConfig: ProviderAccountConfigModule = {
  defaultConfigValues: {},
  toFormValues: () => ({}),
  toConfig: () => ({}),
  Fields: GenericAccountFields,
};
