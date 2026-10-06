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
  AccountDeps,
} from '../../types.ts';
import {
  buildMqttClientOptions,
  describeMqttConnectError,
  endClient,
  isMqttCredentialsRefusal,
  mintMqttClientId,
  parseMqttAccountConfig,
  topicPrefixOf,
} from './mqttConnection.ts';
import type { MqttMessageEvent } from '../../EventBus.ts';
import { ProviderPermanentError } from '../../providerFailure.ts';

/**
 * Owns the one connection to a broker. Ingest, Home Assistant publishing and
 * the diagnostic-blob path all multiplex over it
 * (summaries/mqtt-integration-plan.md §5.2). Today it subscribes to the
 * account's topic prefix and republishes every message on the EventBus as
 * `mqtt.message`; it registers no devices yet.
 */
export class MqttAccountManager implements AccountManager {
  readonly accountId: number;
  private readonly config: MqttAccountConfig;
  private readonly runtime: MqttRuntimeState;
  private readonly deps: AccountDeps;
  private client: MqttClient | null = null;
  /** What the broker or the socket last said, for the close that follows it. */
  private lastFailure: unknown = null;

  constructor(account: ProviderAccount, deps: AccountDeps) {
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
   * initialization hostage. Reconnects are off; a closed connection is
   * reported through `deps.health`, whose backoff is the only retry.
   */
  async initialize(): Promise<void> {
    const client = mqtt.connect(
      this.config.url,
      buildMqttClientOptions(this.config, await this.ensureClientId(), {
        reconnectPeriod: 0,
      }),
    );
    client.on('connect', () => {
      this.lastFailure = null;
      this.deps.logger.log(
        `MQTT account ${this.accountId} connected to ${this.config.url}`,
      );
    });
    client.on('error', (error) => {
      this.lastFailure = error;
    });
    client.on('close', () => {
      if (this.client !== client) return;
      const cause = this.lastFailure;
      const reason = cause
        ? describeMqttConnectError(cause)
        : 'Broker closed the connection';
      this.deps.health.fail(
        isMqttCredentialsRefusal(cause)
          ? new ProviderPermanentError(reason, { cause })
          : new Error(reason, { cause }),
      );
    });
    client.on('message', (topic, payload, packet) => {
      const event: MqttMessageEvent = {
        accountId: this.accountId,
        topic,
        payload,
        retain: packet.retain,
      };
      this.deps.eventBus.publish('mqtt.message', event);
    });
    // Queued until CONNACK and re-sent by MQTT.js after every reconnect.
    client.subscribe(`${topicPrefixOf(this.config)}/#`, { qos: 1 }, (error) => {
      if (error) {
        this.deps.logger.warn(
          `MQTT account ${this.accountId} could not subscribe: ${error.message}`,
        );
      }
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
