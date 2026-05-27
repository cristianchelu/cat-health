import type {
  DeviceProvider,
  ProviderAccount,
  ProviderDeps,
  AccountManager,
} from '../../types.ts';
import { SurePetAccountManager } from './SurePetAccountManager.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class SurePetProvider implements DeviceProvider {
  readonly name = 'surepet';
  readonly internal = false;

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
