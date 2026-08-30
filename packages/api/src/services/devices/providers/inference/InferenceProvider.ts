import type { ProviderCapabilities } from 'shared';
import type {
  DeviceProvider,
  ProviderAccount,
  AccountManager,
} from '../../types.ts';
import { InferenceAccountManager } from './InferenceAccountManager.ts';

export class InferenceProvider implements DeviceProvider {
  readonly name = 'inference';
  readonly internal = false; // User-visible in provider list
  /*
   * No device types at all: an inference account is a credential the app bills
   * recognition against, not a source of hardware. `supports_recognition` is
   * what makes it eligible for a device's recognition attachment.
   */
  readonly capabilities: ProviderCapabilities = {
    supported_device_types: [],
    supports_recognition: true,
  };

  createAccountManager(account: ProviderAccount): AccountManager {
    return new InferenceAccountManager(account);
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
