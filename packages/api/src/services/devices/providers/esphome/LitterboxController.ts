import {
  type Entity as EspHomeEntity,
  EspHomeClient,
  LogLevel,
} from 'esphome-client';
import type { DeviceStatus, EntityDTO } from 'shared';
import type { DeviceController, ProviderDeps, Device } from '../../types.ts';

interface LitterboxConfig {
  host: string;
  port?: number;
  encryptionKey?: string;
  clientId?: string;
}

interface LitterboxState {
  // Add litterbox-specific state properties here
}

export class LitterboxController implements DeviceController {
  readonly deviceId: number;
  private client: EspHomeClient;
  private config: LitterboxConfig;
  private status: DeviceStatus = 'unknown';
  private device: Device;
  private deps: ProviderDeps;
  private state: LitterboxState = {
    // Initialize state properties
  };
  private sensorValues: Map<string, unknown> = new Map();
  private entityDefinitions: Map<number, EspHomeEntity> = new Map();

  constructor(device: Device, deps: ProviderDeps) {
    console.log('Initializing LitterboxController for device:', device.name);
    this.device = device;
    this.deps = deps;
    this.deviceId = device.id;

    // Parse config
    const rawConfig = device.config as unknown as LitterboxConfig;
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

  private setupListeners() {
    this.client.on('connect', () => {
      this.status = 'online';
      console.log(
        `Connected to litterbox ${this.device.name} (${this.config.host})`,
      );
      this.client.subscribeToLogs(LogLevel.INFO);
    });

    this.client.on('disconnect', () => {
      this.status = 'offline';
      console.error(`Disconnected from litterbox ${this.device.name}`);
    });

    this.client.on('entities', (data) => {
      console.log(
        `Received ${data.length} entities from litterbox ${this.device.name}`,
      );

      for (const entity of data) {
        this.entityDefinitions.set(entity.key, entity);
      }
    });

    this.client.on('sensor', ({ entity, state }) => {
      this.sensorValues.set(this.getEntityId(entity), state);
    });

    this.client.on('number', ({ entity, state }) => {
      this.sensorValues.set(this.getEntityId(entity), state);
    });

    this.client.on('switch', ({ entity, state }) => {
      this.sensorValues.set(this.getEntityId(entity), state);
    });

    this.client.on('binary_sensor', ({ entity, state }) => {
      // Update generic entities map
      const id = this.getEntityId(entity);
      this.sensorValues.set(id, state);
    });
  }

  async connect(): Promise<void> {
    try {
      this.client.connect();
    } catch (error) {
      console.error(`Failed to connect to ${this.config.host}:`, error);
      this.status = 'error';
    }
  }

  async disconnect(): Promise<void> {
    this.client.disconnect();
    this.status = 'offline';
  }

  getStatus() {
    return this.status;
  }

  private getEntityId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '_');
  }

  private mapToEntityDTO(def: EspHomeEntity): EntityDTO {
    const id = this.getEntityId(def.name);

    // @ts-expect-error: TODO: Fix type mismatch after EntityDTO updated
    const dto: EntityDTO = {
      ...def,
      id,
      value: this.sensorValues.get(id),
      unit: 'unitOfMeasurement' in def ? def.unitOfMeasurement : undefined,
    };

    return dto;
  }

  getState() {
    return {
      ...this.state,
      entities: Array.from(this.entityDefinitions.values()).map((def) =>
        this.mapToEntityDTO(def),
      ),
      sensors: Object.fromEntries(this.sensorValues),
    };
  }
}
