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

  /**
   * A different email is a different SurePet account, and every registered
   * device row already holds an `external_id` naming a device in the *old*
   * household. Nothing re-derives those ids on a config edit, so the account
   * would come back "connected" while `buildLocalDeviceMap()` silently routed
   * every incoming datapoint to `skippedUnmapped` and the state poller asked
   * the cloud about devices it no longer owns.
   *
   * Re-discovery is not an option here: the feeder ids change, so the local
   * device rows can only be replaced, and deleting them cascades away their
   * whole event history. Refusing the edit keeps that history intact and makes
   * the (rare) "I moved to another SurePet account" case an explicit one:
   * unregister the devices, or add a second account.
   */
  validateAccountConfigChange({
    previousConfig,
    nextConfig,
    registeredDeviceCount,
  }: {
    previousConfig: unknown;
    nextConfig: unknown;
    registeredDeviceCount: number;
  }): string | null {
    if (registeredDeviceCount === 0) return null;

    const prev = isRecord(previousConfig) ? previousConfig : {};
    const next = isRecord(nextConfig) ? nextConfig : {};
    if (prev.email === next.email) return null;

    return `Cannot change the account email while ${registeredDeviceCount} device(s) are registered to it: their remote ids belong to the previous account. Remove the devices first, or add a separate account.`;
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
