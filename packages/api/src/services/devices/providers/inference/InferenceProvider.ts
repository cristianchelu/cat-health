import type {
  DeviceProvider,
  ProviderAccount,
  ProviderDeps,
  AccountManager,
} from '../../types.ts';
import { InferenceAccountManager } from './InferenceAccountManager.ts';

export class InferenceProvider implements DeviceProvider {
  readonly name = 'inference';
  readonly internal = false; // User-visible in provider list

  createAccountManager(
    account: ProviderAccount,
    deps: ProviderDeps,
  ): AccountManager {
    return new InferenceAccountManager(account, deps);
  }

  validateAccountConfig(config: unknown): boolean {
    if (typeof config !== 'object' || config === null) {
      return false;
    }

    const cfg = config as Record<string, unknown>;
    return (
      typeof cfg.api_key === 'string' &&
      cfg.api_key.length > 0 &&
      typeof cfg.base_url === 'string' &&
      cfg.base_url.length > 0
    );
  }
}
