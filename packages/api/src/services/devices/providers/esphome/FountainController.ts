import {
  type Entity as EspHomeEntity,
  EspHomeClient,
  LogLevel,
  type SensorEvent,
} from 'esphome-client';
import type { DeviceStatus, EntityDTO } from 'shared';
import type { DeviceController, ProviderDeps, Device } from '../../types.ts';
import type { PendingMedia } from '../../../media/MediaManager.ts';
import type {
  NewEvent,
  WaterIntakeEventData,
} from '../../../../database/types/EventTable.ts';

interface FountainConfig {
  host: string;
  port?: number;
  encryptionKey?: string;
  clientId?: string;
}

interface FountainState {
  waterLevel: number; // %
  waterDaysRemaining: number;
  filterDaysRemaining: number;
  pumpStatus: 'ok' | 'error';
}

export class FountainController implements DeviceController {
  readonly deviceId: number;
  private client: EspHomeClient;
  private config: FountainConfig;
  private currentEvent: NewEvent<WaterIntakeEventData> | null = null;
  private pendingSnapshot: PendingMedia | null = null;
  private status: DeviceStatus = 'unknown';
  private device: Device;
  private deps: ProviderDeps;
  private state: FountainState = {
    waterLevel: 0,
    waterDaysRemaining: 0,
    filterDaysRemaining: 0,
    pumpStatus: 'ok',
  };
  private sensorValues: Map<string, unknown> = new Map();
  private entityDefinitions: Map<number, EspHomeEntity> = new Map();

  constructor(device: Device, deps: ProviderDeps) {
    console.log('Initializing FountainController for device:', device.name);
    this.device = device;
    this.deps = deps;
    this.deviceId = device.id;

    // Parse config
    const rawConfig = device.config as unknown as FountainConfig;
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
        `Connected to fountain ${this.device.name} (${this.config.host})`,
      );
      this.client.subscribeToLogs(LogLevel.INFO);
    });

    this.client.on('disconnect', () => {
      this.status = 'offline';
      console.error(`Disconnected from fountain ${this.device.name}`);
    });

    this.client.on('entities', (data) => {
      console.log(
        `Received ${data.length} entities from fountain ${this.device.name}`,
      );

      for (const entity of data) {
        this.entityDefinitions.set(entity.key, entity);
      }
    });

    // this.client.on('deviceInfo', (info) => {
    // console.dir(info);
    // });

    this.client.on('sensor', ({ entity, state }) => {
      this.sensorValues.set(this.getEntityId(entity), state);
    });

    this.client.on('number', ({ entity, state }) => {
      this.sensorValues.set(this.getEntityId(entity), state);
    });

    this.client.on('switch', ({ entity, state }) => {
      this.sensorValues.set(this.getEntityId(entity), state);
    });

    this.client.on('binary_sensor', async ({ entity, state }) => {
      // Update generic entities map
      const id = this.getEntityId(entity);
      this.sensorValues.set(id, state);

      if (entity === 'Pump Status') {
        this.state.pumpStatus = state ? 'error' : 'ok';
        return;
      }

      if (entity !== 'Activity') {
        return;
      }

      if (state === true) {
        const date = new Date();
        this.currentEvent = {
          data: {
            type: 'water_intake',
            amount: 0,
            duration: 0,
          },
          timestamp: date,
          human_verified: false,
          pet_id: null,
          device_id: this.deviceId,
          raw_data: null,
        };

        // Direct camera capture
        const camera = await this.deps.directory.getLinkedCamera(this.deviceId);
        if (camera) {
          this.pendingSnapshot =
            (await camera.captureSnapshot({
              timestamp: date,
              eventType: 'water_intake',
            })) || null;
        }
      } else {
        // Activity just ended, the next sensor updates will be what we want
        console.log('Activity detected. Waiting for drink data...');
        this.captureNextDrinkData();
      }
    });
  }

  private captureNextDrinkData() {
    if (!this.currentEvent) {
      console.warn('No active drink event to capture data for.');
      return;
    }

    const onSensorUpdate = (event: SensorEvent) => {
      const { data } = this.currentEvent!;

      if (event.entity === 'Last drink amount' && !!event.state) {
        data.amount = Math.round(event.state);
      } else if (event.entity === 'Last drink duration' && !!event.state) {
        data.duration = Math.round(event.state);
      }

      // Once both values are captured, save them
      if (!!this.currentEvent && data.amount && data.duration) {
        this.saveDrinkEvent(this.currentEvent, this.pendingSnapshot);
        this.client.off('sensor', onSensorUpdate);
        this.currentEvent = null;
        this.pendingSnapshot = null;
      }
    };

    this.client.on('sensor', onSensorUpdate);

    setTimeout(async () => {
      if (this.currentEvent) {
        console.warn('Timed out waiting for drink data.');
        this.client.off('sensor', onSensorUpdate);

        if (this.pendingSnapshot) {
          await this.pendingSnapshot.cleanup();
          this.pendingSnapshot = null;
        }

        this.currentEvent = null;
      }
    }, 5000); // Increased timeout to 5s just in case
  }

  private async saveDrinkEvent(
    event: NewEvent<WaterIntakeEventData>,
    snapshot: PendingMedia | null,
  ) {
    const eventData = event.data;
    const eventTimestamp = event.timestamp;

    console.log('--- SAVING DRINK EVENT ---');
    console.log(`Device: ${this.device.name}`);
    console.log(`Amount: ${eventData.amount}ml`);
    console.log(`Duration: ${eventData.duration}s`);
    console.log('--------------------------');

    try {
      const result = await this.deps.db
        .insertInto('event')
        .values(event)
        .returning('id')
        .executeTakeFirst();
      console.log('Drink event inserted into DB.');

      if (!result) {
        return;
      }

      if (snapshot) {
        try {
          const media = await this.deps.mediaManager.persistMedia(
            snapshot.path,
            snapshot.metadata,
            'image/jpeg',
          );
          await this.deps.mediaManager.linkMediaToEvent(
            media.id,
            result.id,
            'snapshot',
          );
          console.log(`Linked snapshot ${media.id} to event ${result.id}`);
        } catch (mediaErr) {
          console.error('Failed to persist snapshot:', mediaErr);
          await snapshot.cleanup();
        }
      }

      // Emit completed event
      this.deps.eventBus.publish('device.event', {
        deviceId: this.deviceId,
        type: 'water_intake',
        data: eventData,
        timestamp: eventTimestamp,
        eventId: result.id,
      });
    } catch (err) {
      console.error('Failed to insert drink event:', err);
      // Cleanup pending snapshot if event save failed
      if (snapshot) {
        await snapshot.cleanup();
      }
    }
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
