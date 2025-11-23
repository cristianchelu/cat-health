import type {
  DeviceProvider,
  ProviderAccount,
  ProviderDeps,
  AccountManager,
} from '../../types.ts';
import { ESPHomeAccountManager } from './ESPHomeAccountManager.ts';

export class ESPHomeProvider implements DeviceProvider {
  readonly name = 'esphome';
  readonly internal = true;

  createAccountManager(
    account: ProviderAccount,
    deps: ProviderDeps,
  ): AccountManager {
    return new ESPHomeAccountManager(account, deps);
  }

  validateAccountConfig(config: unknown): boolean {
    // ESPHome provider might not need much config if it's just local discovery,
    // or it might need a list of static IPs if mDNS is not reliable.
    // For now, we accept any object.
    return typeof config === 'object' && config !== null;
  }
}
