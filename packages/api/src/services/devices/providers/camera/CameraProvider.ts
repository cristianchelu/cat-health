import type { ProviderCapabilities } from 'shared';
import type {
  DeviceProvider,
  ProviderAccount,
  ProviderDeps,
  AccountManager,
} from '../../types.ts';
import { CameraAccountManager } from './CameraAccountManager.ts';

export class CameraProvider implements DeviceProvider {
  readonly name = 'camera';
  readonly internal = true;
  readonly capabilities: ProviderCapabilities = {
    skip_discovery: true,
    supported_device_types: ['camera'],
  };

  createAccountManager(
    account: ProviderAccount,
    deps: ProviderDeps,
  ): AccountManager {
    return new CameraAccountManager(account, deps);
  }

  validateAccountConfig(config: unknown): boolean {
    return typeof config === 'object' && config !== null;
  }
}
