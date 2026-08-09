import {
  type Entity as EspHomeEntity,
  EntityCategory,
  EspHomeClient,
  LogLevel,
} from 'esphome-client';
import { type Static, Type } from '@fastify/type-provider-typebox';
import {
  requireWithSchema,
  type DeviceSignal,
  type DeviceStatus,
  type EntityDTO,
} from 'shared';
import type { DeviceController, ProviderDeps, Device } from '../../types.ts';
import { batterySignal, signalStrengthSignal } from '../../signalBuilders.ts';
import { WIFI_RSSI_LADDER } from '../../signalStrength.ts';

export const ESPHomeConfigSchema = Type.Object({
  host: Type.String({ minLength: 1 }),
  port: Type.Optional(Type.Number()),
  encryptionKey: Type.Optional(Type.String()),
  clientId: Type.Optional(Type.String()),
  /**
   * Set the first time ESPHome reports a camera entity. Survives offline
   * periods so the Camera tab can still offer the integrated source.
   */
  hasCamera: Type.Optional(Type.Boolean()),
  /**
   * Days a fresh filter lasts on this device, which is what a filter-life bar
   * is drawn against. The device reports days remaining but not the interval
   * they count down from, and assuming one would put an invented number on a
   * gauge. Unset means the signal shows its countdown without a bar.
   */
  filterIntervalDays: Type.Optional(Type.Number({ minimum: 1 })),
  /**
   * Grams of waste that mean this box needs emptying. Household-specific, so
   * there is no default: unset means waste is reported without an urgency band.
   */
  wasteThresholdG: Type.Optional(Type.Number({ minimum: 1 })),
  /** Kilograms of litter a full box holds, which a litter-level bar needs. */
  litterFullKg: Type.Optional(Type.Number({ minimum: 0.1 })),
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
    // Spread rather than copy field-by-field so a config key added to the
    // schema cannot be silently dropped here.
    this.config = {
      ...rawConfig,
      port: rawConfig.port ?? 6053,
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

  /** Latest numeric reading for an object id, or null when absent or unread. */
  protected sensorNumber(objectId: string): number | null {
    const key = this.getEntityKey(objectId);
    if (key === null) return null;
    const value = this.sensorValues.get(key);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  /**
   * Latest numeric reading for the first entity of a device class. ESPHome
   * device classes are stable across configs in a way object ids are not, so
   * diagnostics resolve by class and fall back to conventional object ids.
   */
  private sensorByDeviceClass(deviceClass: string): number | null {
    for (const entity of this.entityDefinitions.values()) {
      if (
        'deviceClass' in entity &&
        entity.deviceClass === deviceClass &&
        typeof this.sensorValues.get(entity.key) === 'number'
      ) {
        return this.sensorValues.get(entity.key) as number;
      }
    }
    return null;
  }

  /**
   * Signal strength and battery, which every ESPHome node may expose and no
   * device type owns. Concrete controllers spread these into their own signals.
   */
  protected diagnosticSignals(): DeviceSignal[] {
    const signals: DeviceSignal[] = [];

    const rssi =
      this.sensorByDeviceClass('signal_strength') ??
      this.sensorNumber('wifi_signal') ??
      this.sensorNumber('wifi_signal_db');
    if (rssi !== null) {
      signals.push(signalStrengthSignal(rssi, WIFI_RSSI_LADDER));
    }

    const battery =
      this.sensorByDeviceClass('battery') ?? this.sensorNumber('battery_level');
    if (battery !== null) {
      signals.push(batterySignal(battery));
    }

    return signals;
  }

  getSignals(): DeviceSignal[] {
    return this.diagnosticSignals();
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
