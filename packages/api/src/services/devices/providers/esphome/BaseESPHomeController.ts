import {
  type Entity as EspHomeEntity,
  EntityCategory,
  EspHomeClient,
  LogLevel,
} from 'esphome-client';
import { type Static, Type } from '@fastify/type-provider-typebox';
import { requireWithSchema, type DeviceStatus, type EntityDTO } from 'shared';
import type { DeviceController, ProviderDeps, Device } from '../../types.ts';

export const ESPHomeConfigSchema = Type.Object({
  host: Type.String({ minLength: 1 }),
  port: Type.Optional(Type.Number()),
  encryptionKey: Type.Optional(Type.String()),
  clientId: Type.Optional(Type.String()),
});
export type ESPHomeConfig = Static<typeof ESPHomeConfigSchema>;

export interface ReconnectConfig {
  baseDelay: number;
  maxDelay: number;
  heartbeatTimeout: number;
  pingInterval: number;
  /** If the native API handshake stalls after `client.connect()`, force a disconnect so reconnect can retry. */
  connectHandshakeTimeout: number;
}

function mapEspHomeEntityCategory(
  entity: EspHomeEntity,
): 'primary' | 'config' | 'diagnostic' {
  const raw =
    'entityCategory' in entity &&
    typeof (entity as { entityCategory?: unknown }).entityCategory === 'number'
      ? (entity as { entityCategory: number }).entityCategory
      : undefined;
  if (raw === EntityCategory.CONFIG) {
    return 'config';
  }
  if (raw === EntityCategory.DIAGNOSTIC) {
    return 'diagnostic';
  }
  return 'primary';
}

export abstract class BaseESPHomeController implements DeviceController {
  readonly deviceId: number;
  protected client: EspHomeClient;
  protected config: ESPHomeConfig;
  protected status: DeviceStatus = 'unknown';
  protected device: Device;
  protected deps: ProviderDeps;
  protected sensorValues: Map<number, unknown> = new Map();
  protected entityDefinitions: Map<number, EspHomeEntity> = new Map();
  protected objectIdToKeyMap: Map<string, number> = new Map();

  // Connection state
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnecting = false;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private inactivityCheck: ReturnType<typeof setInterval> | null = null;
  private lastTelemetryAt: number | null = null;
  private pingInFlight = false;
  private connectHandshakeWatchdog: ReturnType<typeof setTimeout> | null = null;

  // Abstract methods for subclass customization
  protected abstract get deviceTypeName(): string;
  protected abstract get reconnectConfig(): ReconnectConfig;
  protected abstract onConnected(): void;
  protected abstract onEntitiesReceived(entities: EspHomeEntity[]): void;
  protected abstract handleSensorUpdate(key: number, state: unknown): void;

  constructor(device: Device, deps: ProviderDeps) {
    console.log(
      `Initializing ${this.constructor.name} for device:`,
      device.name,
    );
    this.device = device;
    this.deps = deps;
    this.deviceId = device.id;

    // Parse config
    const rawConfig = requireWithSchema(
      ESPHomeConfigSchema,
      device.config,
      'ESPHome configuration',
    );
    this.config = {
      host: rawConfig.host,
      port: rawConfig.port ?? 6053,
      encryptionKey: rawConfig.encryptionKey,
      clientId: rawConfig.clientId ?? `cat-health-${device.id}`,
    };

    this.client = new EspHomeClient({
      host: this.config.host,
      port: this.config.port,
      psk: this.config.encryptionKey,
      clientId: this.config.clientId,
    });

    this.setupListeners();
  }

  protected setupListeners() {
    this.client.on('connect', () => {
      this.clearConnectHandshakeWatchdog();
      this.status = 'online';
      this.reconnectAttempts = 0;
      this.clearReconnectTimeout();
      this.manualDisconnecting = false;
      const at = Date.now();
      this.lastTelemetryAt = at;
      this.pingInFlight = false;
      this.clearHeartbeatTimeout();
      this.deps.presence.reportOnline(this.deviceId, at);
      this.startInactivityCheck();
      console.log(
        `Connected to ${this.deviceTypeName} ${this.device.name} (${this.config.host})`,
      );
      this.client.subscribeToLogs(LogLevel.INFO);
      this.onConnected();
    });

    this.client.on('disconnect', () => {
      this.clearConnectHandshakeWatchdog();
      this.status = 'offline';
      this.deps.presence.reportOffline(
        this.deviceId,
        this.lastTelemetryAt != null
          ? { lastActivityMs: this.lastTelemetryAt }
          : {},
      );
      console.error(
        `Disconnected from ${this.deviceTypeName} ${this.device.name}`,
      );
      this.clearHeartbeatTimeout();
      this.stopInactivityCheck();
      if (this.manualDisconnecting) {
        this.manualDisconnecting = false;
        return;
      }
      this.scheduleReconnect('disconnect');
    });

    this.client.on('heartbeat', this.markTelemetry.bind(this));

    this.client.on('entities', (data) => {
      console.log(
        `Received ${data.length} entities from ${this.deviceTypeName} ${this.device.name}`,
      );

      for (const entity of data) {
        this.entityDefinitions.set(entity.key, entity);
        if (entity.objectId) {
          this.objectIdToKeyMap.set(entity.objectId, entity.key);
        }
      }

      this.onEntitiesReceived(data);
      this.recordDeviceActivity();
    });

    this.client.on('telemetry', this.markTelemetry.bind(this));

    this.client.on('sensor', ({ key, state }) => {
      this.sensorValues.set(key, state);
      this.recordDeviceActivity();
      this.handleSensorUpdate(key, state);
    });

    this.client.on('number', ({ key, state }) => {
      this.sensorValues.set(key, state);
      this.recordDeviceActivity();
    });

    this.client.on('switch', ({ key, state }) => {
      this.sensorValues.set(key, state);
      this.recordDeviceActivity();
    });

    this.client.on('binary_sensor', ({ key, state }) => {
      this.sensorValues.set(key, state);
      this.recordDeviceActivity();
      this.handleSensorUpdate(key, state);
    });
  }

  private clearConnectHandshakeWatchdog() {
    if (this.connectHandshakeWatchdog) {
      clearTimeout(this.connectHandshakeWatchdog);
      this.connectHandshakeWatchdog = null;
    }
  }

  /**
   * `esphome-client` can leave TCP + Noise handshakes pending without a reliable
   * connection-level timeout; if `connect` never completes, recycle the client so
   * our normal reconnect backoff can try again (e.g. after OTA while Wi‑Fi/API wake).
   */
  private armConnectHandshakeWatchdog() {
    this.clearConnectHandshakeWatchdog();
    const ms = this.reconnectConfig.connectHandshakeTimeout;
    this.connectHandshakeWatchdog = setTimeout(() => {
      this.connectHandshakeWatchdog = null;
      if (this.manualDisconnecting || this.status === 'online') {
        return;
      }
      console.warn(
        `Connect handshake stalled for ${this.deviceTypeName} ${this.device.name} (${ms}ms); forcing disconnect to retry`,
      );
      this.client.disconnect();
    }, ms);
  }

  protected recordDeviceActivity(at: number = Date.now()) {
    this.lastTelemetryAt = at;
    if (this.status !== 'online') {
      return;
    }
    this.deps.presence.recordActivity(this.deviceId, at);
  }

  protected clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  protected clearHeartbeatTimeout() {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  protected markTelemetry() {
    this.pingInFlight = false;
    this.clearHeartbeatTimeout();
    this.recordDeviceActivity();
  }

  protected startInactivityCheck() {
    this.stopInactivityCheck();
    const config = this.reconnectConfig;
    this.inactivityCheck = setInterval(() => {
      if (this.manualDisconnecting || this.pingInFlight) {
        return;
      }

      const lastSeen = this.lastTelemetryAt ?? 0;
      const idleForMs = Date.now() - lastSeen;
      if (idleForMs < config.pingInterval) {
        return;
      }

      try {
        this.pingInFlight = true;
        this.client.sendPing();
        this.scheduleHeartbeatTimeout();
      } catch (error) {
        console.error(
          `Ping failed for ${this.deviceTypeName} ${this.device.name}:`,
          error,
        );
        this.pingInFlight = false;
        this.clearHeartbeatTimeout();
        this.stopInactivityCheck();
        this.status = 'offline';
        this.deps.presence.reportOffline(
          this.deviceId,
          this.lastTelemetryAt != null
            ? { lastActivityMs: this.lastTelemetryAt }
            : {},
        );
        this.scheduleReconnect('ping-failed');
      }
    }, config.pingInterval);
  }

  protected stopInactivityCheck() {
    if (this.inactivityCheck) {
      clearInterval(this.inactivityCheck);
      this.inactivityCheck = null;
    }
    this.pingInFlight = false;
  }

  protected scheduleHeartbeatTimeout() {
    this.clearHeartbeatTimeout();
    const config = this.reconnectConfig;
    this.heartbeatTimeout = setTimeout(() => {
      this.heartbeatTimeout = null;
      console.warn(
        `Heartbeat timeout for ${this.deviceTypeName} ${this.device.name}; reconnecting`,
      );
      if (!this.manualDisconnecting) {
        this.pingInFlight = false;
        this.status = 'offline';
        this.deps.presence.reportOffline(
          this.deviceId,
          this.lastTelemetryAt != null
            ? { lastActivityMs: this.lastTelemetryAt }
            : {},
        );
        this.stopInactivityCheck();
        this.client.disconnect();
      }
    }, config.heartbeatTimeout);
  }

  protected scheduleReconnect(reason: string) {
    if (this.reconnectTimeout) {
      return;
    }

    const attempt = this.reconnectAttempts + 1;
    this.reconnectAttempts = attempt;
    const config = this.reconnectConfig;
    const delay = Math.min(
      config.maxDelay,
      config.baseDelay * 2 ** (attempt - 1),
    );

    console.warn(
      `Scheduling reconnect for ${this.deviceTypeName} ${this.device.name} in ${delay}ms (${reason}, attempt ${attempt})`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      try {
        this.armConnectHandshakeWatchdog();
        this.client.connect();
      } catch (error) {
        this.clearConnectHandshakeWatchdog();
        console.error(
          `Failed to reconnect to ${this.config.host} (${this.deviceTypeName}):`,
          error,
        );
        this.scheduleReconnect('reconnect-failed');
      }
    }, delay);
  }

  async connect(): Promise<void> {
    this.deps.presence.reportOffline(
      this.deviceId,
      this.lastTelemetryAt != null
        ? { lastActivityMs: this.lastTelemetryAt }
        : {},
    );
    try {
      this.armConnectHandshakeWatchdog();
      this.client.connect();
    } catch (error) {
      this.clearConnectHandshakeWatchdog();
      console.error(`Failed to connect to ${this.config.host}:`, error);
      this.status = 'offline';
      this.deps.presence.reportOffline(
        this.deviceId,
        this.lastTelemetryAt != null
          ? { lastActivityMs: this.lastTelemetryAt }
          : {},
      );
      this.scheduleReconnect('connect-failed');
    }
  }

  async disconnect(): Promise<void> {
    this.manualDisconnecting = true;
    this.clearReconnectTimeout();
    this.clearConnectHandshakeWatchdog();
    this.clearHeartbeatTimeout();
    this.stopInactivityCheck();
    this.client.disconnect();
    this.status = 'offline';
    this.deps.presence.reportOffline(
      this.deviceId,
      this.lastTelemetryAt != null
        ? { lastActivityMs: this.lastTelemetryAt }
        : {},
    );
  }

  getStatus() {
    return this.status;
  }

  /**
   * Get the entity key for a given objectId.
   * Returns the numeric key used for sensor value lookups.
   */
  protected getEntityKey(objectId: string): number | null {
    return this.objectIdToKeyMap.get(objectId) ?? null;
  }

  protected mapToEntityDTO(entity: EspHomeEntity): EntityDTO {
    const objectId = entity.objectId;
    const category = mapEspHomeEntityCategory(entity);
    const deviceClass =
      'deviceClass' in entity && typeof entity.deviceClass === 'string'
        ? entity.deviceClass
        : undefined;
    const icon =
      'icon' in entity && typeof entity.icon === 'string'
        ? entity.icon
        : undefined;

    const accuracyDecimals =
      entity.type === 'sensor' &&
      'accuracyDecimals' in entity &&
      typeof (entity as { accuracyDecimals?: unknown }).accuracyDecimals ===
        'number' &&
      Number.isFinite((entity as { accuracyDecimals: number }).accuracyDecimals)
        ? Math.min(
            15,
            Math.max(
              0,
              Math.floor(
                (entity as { accuracyDecimals: number }).accuracyDecimals,
              ),
            ),
          )
        : undefined;

    const dto = {
      ...entity,
      id: objectId ?? entity.name,
      objectId: objectId ?? undefined,
      value: this.sensorValues.get(entity.key),
      unit:
        'unitOfMeasurement' in entity ? entity.unitOfMeasurement : undefined,
      category,
      deviceClass,
      icon,
      accuracyDecimals,
    };

    return dto as EntityDTO;
  }

  getState() {
    return {
      entities: Array.from(this.entityDefinitions.values()).map((def) =>
        this.mapToEntityDTO(def),
      ),
      sensors: Object.fromEntries(this.sensorValues),
    };
  }
}
