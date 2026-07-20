import { isRecord } from 'shared';
import type { ProviderCapabilities } from 'shared';
import type {
  DeviceProvider,
  ProviderAccount,
  ProviderDeps,
  AccountManager,
} from '../../types.ts';
import { SurePetAccountManager } from './SurePetAccountManager.ts';


export class SurePetProvider implements DeviceProvider {
  readonly name = 'surepet';
  readonly internal = false;
  readonly capabilities: ProviderCapabilities = {
    supports_discovery: true,
    supports_pet_linking: true,
    supported_device_types: ['feeder'],
  };

  createAccountManager(
    account: ProviderAccount,
    deps: ProviderDeps,
  ): AccountManager {
    return new SurePetAccountManager(account, deps);
  }

  validateAccountConfig(config: unknown): boolean {
    if (!isRecord(config)) return false;

    const email = config.email;
    const password = config.password;
    const deviceId = config.device_id;

    return (
      typeof email === 'string' &&
      email.length > 0 &&
      typeof password === 'string' &&
      password.length > 0 &&
      (deviceId === undefined ||
        (typeof deviceId === 'string' && deviceId.length > 0))
    );
  }
}
