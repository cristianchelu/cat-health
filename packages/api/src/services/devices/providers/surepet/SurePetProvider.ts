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

    return (
      typeof email === 'string' &&
      email.length > 0 &&
      typeof password === 'string' &&
      password.length > 0
    );
  }

  reconcileRuntimeState({
    previousConfig,
    nextConfig,
    runtimeState,
  }: {
    previousConfig: unknown;
    nextConfig: unknown;
    runtimeState: unknown;
  }): Record<string, unknown> {
    const prev = isRecord(previousConfig) ? previousConfig : {};
    const next = isRecord(nextConfig) ? nextConfig : {};
    const runtime = isRecord(runtimeState) ? { ...runtimeState } : {};

    const emailChanged = prev.email !== next.email;
    const passwordChanged = prev.password !== next.password;
    if (!emailChanged && !passwordChanged) return runtime;

    // A cached bearer token belongs to the old credentials; keeping it would
    // let the manager keep authenticating as the previous account until expiry.
    delete runtime.token;
    delete runtime.household_id;

    // A different email is a different account, so the timeline cursor points
    // into someone else's history. A rotated password is the same account, so
    // the cursor stays valid and re-ingesting the whole timeline is avoided.
    if (emailChanged) delete runtime.sync;

    // device_id is this installation's identity, not the account's — keeping it
    // stable avoids SurePet treating every credential edit as a new client.
    return runtime;
  }
}
