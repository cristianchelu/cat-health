import type { ProviderAccountConfigModule } from './accountConfigTypes.ts';
import { GenericAccountFields } from './GenericAccountFields.tsx';

/** The module every provider without its own account form falls back to. */
export const genericAccountConfig: ProviderAccountConfigModule = {
  defaultConfigValues: {},
  toFormValues: () => ({}),
  toConfig: () => ({}),
  Fields: GenericAccountFields,
};
