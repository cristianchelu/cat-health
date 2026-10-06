import type { ProviderCapabilities } from 'shared';
import type {
  AccountManager,
  DeviceProvider,
  ProviderAccount,
  AccountDeps,
} from '../../types.ts';
import { MqttAccountManager } from './MqttAccountManager.ts';
import { parseMqttAccountConfig, probeMqttBroker } from './mqttConnection.ts';

export class MqttProvider implements DeviceProvider {
  readonly name = 'mqtt';
  readonly internal = false;
  /*
   * The account is a broker connection, not yet a source of hardware. Device
   * discovery under our own topic prefix comes later
   * (summaries/mqtt-integration-plan.md §5.4); until then an account legally
   * owns nothing, the same shape an inference account has.
   */
  readonly capabilities: ProviderCapabilities = {
    supported_device_types: [],
  };
  /** A broker on the LAN: come back quickly, and nobody upstream to spare. */
  readonly retryPolicy = { baseMs: 5_000, maxMs: 60_000 };

  createAccountManager(
    account: ProviderAccount,
    deps: AccountDeps,
  ): AccountManager {
    return new MqttAccountManager(account, deps);
  }

  validateAccountConfig(config: unknown): boolean {
    return parseMqttAccountConfig(config) !== undefined;
  }

  async probeAccountConfig(config: unknown): Promise<void> {
    const parsed = parseMqttAccountConfig(config);
    if (!parsed) {
      throw new Error('MQTT account config must include a broker URL');
    }
    await probeMqttBroker(parsed);
  }
}
