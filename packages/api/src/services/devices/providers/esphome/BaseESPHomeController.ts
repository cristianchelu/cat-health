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
import type { ScheduleSensorReader } from './scheduleBindings.ts';

export const ESPHomeConfigSchema = Type.Object({
  host: Type.String({ minLength: 1 }),
  port: Type.Optional(Type.Number()),
  encryptionKey: Type.Optional(Type.String()),
  clientId: Type.Optional(Type.String()),
  /**
   * `Vendor.Product` as the firmware reports it on connect. Selects a
   * firmware profile when a device's entity ids differ from the contract.
   */
  projectName: Type.Optional(Type.String()),
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

/**
 * Undo proto3 default-elision on state fields.
 *
 * A state at its protobuf default — 0.0 for a sensor, false for a binary
 * sensor — is omitted from the wire entirely, and `esphome-client` decodes
 * an absent field to `undefined`, which reads exactly like "never
 * published". The explicit unknown marker is `missing_state`; without it,
 * an absent state field IS the default value. Losing that distinction
 * swallows every zero: "0 days until deep clean" never arrives, a scoop
 * reset to 0 g never arrives, while vendor tooling (aioesphomeapi) applies
 * the default and shows them fine.
 */
export const coerceNumericState = (
  state: unknown,
  missingState: unknown,
): unknown => (missingState === true ? Number.NaN : (state ?? 0));

export const coerceBooleanState = (
  state: unknown,
  missingState: unknown,
): unknown => (missingState === true ? undefined : (state ?? false));

/**
 * ESPHome's own object_id derivation (`sanitize(snake_case(name))`):
 * lowercase, spaces to underscores, any char outside [a-z0-9-_] to
 * underscore. Firmware ≥2025.10 omits object_id from ListEntities when it
 * equals this derivation, so the client must reproduce it exactly.
 */
export function objectIdFromName(name: unknown): string | null {
  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }
  return name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9-_]/g, '_');
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
        // ESPHome ≥2025.10 omits object_id from ListEntities when it is
        // derivable from the name (API frame-size optimization) and expects
        // clients to derive it, as aioesphomeapi does. Failing to derive
        // silently killed every objectId lookup after a firmware update —
        // no litterbox sessions, no fountain water level.
        const objectId = entity.objectId || objectIdFromName(entity.name);
        if (objectId) {
          this.objectIdToKeyMap.set(objectId, entity.key);
        }
      }

      this.onEntitiesReceived(data);
      this.recordDeviceActivity();
    });

    this.client.on('telemetry', this.markTelemetry.bind(this));

    this.client.on('sensor', (data) => {
      const state = coerceNumericState(data.state, data.missingState);
      this.sensorValues.set(data.key, state);
      this.recordDeviceActivity();
      this.handleSensorUpdate(data.key, state);
    });

    this.client.on('number', (data) => {
      this.sensorValues.set(
        data.key,
        coerceNumericState(data.state, data.missingState),
      );
      this.recordDeviceActivity();
    });

    /* A switch has no missing_state on the wire — off is always knowable. */
    this.client.on('switch', (data) => {
      this.sensorValues.set(
        data.key,
        coerceBooleanState(data.state, undefined),
      );
      this.recordDeviceActivity();
    });

    this.client.on('binary_sensor', (data) => {
      const state = coerceBooleanState(data.state, data.missingState);
      this.sensorValues.set(data.key, state);
      this.recordDeviceActivity();
      this.handleSensorUpdate(data.key, state);
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

  /** Latest boolean reading for an object id, or null when absent or unread. */
  protected sensorBoolean(objectId: string): boolean | null {
    const key = this.getEntityKey(objectId);
    if (key === null) return null;
    const value = this.sensorValues.get(key);
    return typeof value === 'boolean' ? value : null;
  }

  /** The unit an entity declared, when it declared one. */
  protected sensorUnit(objectId: string): string | undefined {
    const key = this.getEntityKey(objectId);
    if (key === null) return undefined;
    const entity = this.entityDefinitions.get(key);
    return entity !== undefined &&
      'unitOfMeasurement' in entity &&
      typeof entity.unitOfMeasurement === 'string'
      ? entity.unitOfMeasurement
      : undefined;
  }

  /** The entity table as `readSchedule` wants to see it. */
  protected scheduleReader(): ScheduleSensorReader {
    return {
      has: (objectId) => this.getEntityKey(objectId) !== null,
      number: (objectId) => this.sensorNumber(objectId),
      unit: (objectId) => this.sensorUnit(objectId),
    };
  }

  /**
   * Latest numeric reading for the first entity of a device class. ESPHome
   * device classes are stable across configs in a way object ids are not, so
   * diagnostics resolve by class and fall back to conventional object ids.
   */
  private sensorByDeviceClass(deviceClass: string): number | null {
    for (const entity of this.entityDefinitions.values()) {
      if ('deviceClass' in entity && entity.deviceClass === deviceClass) {
        const value = this.sensorValues.get(entity.key);
        /* NaN is how ESPHome says "unknown", and it is a number. Reject it
         * here as `sensorNumber` does: a NaN that reaches a signal value
         * fails response serialization for the whole devices list. */
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }
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
