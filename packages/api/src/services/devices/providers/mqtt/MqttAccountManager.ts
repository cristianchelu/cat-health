import mqtt, { type MqttClient } from 'mqtt';
import {
  MqttRuntimeStateSchema,
  parseWithSchema,
  type MqttAccountConfig,
  type MqttRuntimeState,
} from 'shared';
import type {
  AccountManager,
  Device,
  DeviceController,
  DiscoveredDevice,
  ProviderAccount,
  ProviderDeps,
} from '../../types.ts';
import {
  buildMqttClientOptions,
  describeMqttConnectError,
  endClient,
  mintMqttClientId,
  parseMqttAccountConfig,
} from './mqttConnection.ts';

/** How long MQTT.js waits between reconnect attempts once the broker drops us. */
const RECONNECT_PERIOD_MS = 5_000;

/**
 * Owns the one connection to a broker. Ingest, Home Assistant publishing and
 * the diagnostic-blob path are all meant to multiplex over it
 * (summaries/mqtt-integration-plan.md §5.2); for now it only connects, stays
 * connected, and says so in the log. It registers no devices yet.
 */
export class MqttAccountManager implements AccountManager {
  readonly accountId: number;
  private readonly config: MqttAccountConfig;
  private readonly runtime: MqttRuntimeState;
  private readonly deps: ProviderDeps;
  private client: MqttClient | null = null;
  private lastError: string | null = null;

  constructor(account: ProviderAccount, deps: ProviderDeps) {
    this.accountId = account.id;
    this.deps = deps;
    const config = parseMqttAccountConfig(account.config);
    if (!config) {
      throw new Error('MQTT account config must include a broker URL');
    }
    this.config = config;
    this.runtime = {
      ...(parseWithSchema(MqttRuntimeStateSchema, account.runtime_state) ?? {}),
    };
  }

  /**
   * Resolves once the connection is set up, not once the broker answers:
   * a broker that is down at startup must not hold every other account's
   * initialization hostage. MQTT.js keeps retrying on its own.
   */
  async initialize(): Promise<void> {
    const client = mqtt.connect(
      this.config.url,
      buildMqttClientOptions(this.config, await this.ensureClientId(), {
        reconnectPeriod: RECONNECT_PERIOD_MS,
      }),
    );
    client.on('connect', () => {
      this.lastError = null;
      this.deps.logger.log(
        `MQTT account ${this.accountId} connected to ${this.config.url}`,
      );
    });
    // Every failed retry emits an error, so a wrong password would otherwise
    // repeat itself in the log every reconnect period.
    client.on('error', (error) => {
      const reason = describeMqttConnectError(error);
      if (reason === this.lastError) return;
      this.lastError = reason;
      this.deps.logger.warn(`MQTT account ${this.accountId}: ${reason}`);
    });
    client.on('offline', () => {
      this.deps.logger.warn(`MQTT account ${this.accountId} lost the broker`);
    });
    this.client = client;
  }

  async shutdown(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client) await endClient(client);
  }

  /** The user's fixed id when they set one; otherwise the one minted for this account. */
  private async ensureClientId(): Promise<string> {
    if (this.config.client_id) return this.config.client_id;
    if (this.runtime.client_id) return this.runtime.client_id;

    this.runtime.client_id = mintMqttClientId('cat-health');
    await this.deps.db
      .updateTable('provider_account')
      .set({ runtime_state: { ...this.runtime } })
      .where('id', '=', this.accountId)
      .execute();
    return this.runtime.client_id;
  }

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    return [];
  }

  instantiateDeviceController(device: Device): DeviceController {
    throw new Error(
      `Unsupported device type for MQTT provider: ${device.type}`,
    );
  }
}
