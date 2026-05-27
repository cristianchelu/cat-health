import type { ProviderCapabilities } from 'shared';
import type {
  AccountManager,
  DeviceProvider,
  ProviderAccount,
  ProviderDeps,
} from '../../types.ts';
import { ThinginoAccountManager } from './ThinginoAccountManager.ts';

export class ThinginoProvider implements DeviceProvider {
  readonly name = 'thingino';
  readonly internal = true;
  readonly capabilities: ProviderCapabilities = {
    skip_discovery: true,
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
