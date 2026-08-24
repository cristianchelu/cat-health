import type { ProviderCapabilities } from 'shared';
import type {
  DeviceProvider,
  ProviderAccount,
  ProviderDeps,
  AccountManager,
} from '../../types.ts';
import { ThinginoAccountManager } from './ThinginoAccountManager.ts';

export class ThinginoProvider implements DeviceProvider {
  readonly name = 'thingino';
  readonly internal = true;
  readonly capabilities: ProviderCapabilities = {
    supports_discovery: true,
    allows_direct_registration: true,
    supported_device_types: ['camera'],
  };

  createAccountManager(
    account: ProviderAccount,
    deps: ProviderDeps,
  ): AccountManager {
    return new ThinginoAccountManager(account, deps);
  }

  validateAccountConfig(config: unknown): boolean {
    return typeof config === 'object' && config !== null;
  }
}
