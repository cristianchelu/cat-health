import {
  type Entity as EspHomeEntity,
  EspHomeClient,
  LogLevel,
  type SensorEvent,
} from 'esphome-client';
import sharp from 'sharp';
import type { DeviceStatus, EntityDTO, EventType } from 'shared';
import type {
  Camera,
  DeviceController,
  ProviderDeps,
  Device,
} from '../../types.ts';
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
  cameraEnabled?: boolean;
}

interface FountainState {
  waterLevel: number; // %
  waterDaysRemaining: number;
  filterDaysRemaining: number;
  pumpStatus: 'ok' | 'error';
  cameraStatus: 'ok' | 'error' | 'disabled' | 'none';
  hasCamera: boolean;
}

export class FountainController implements DeviceController, Camera {
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
    cameraStatus: 'none',
    hasCamera: false,
  };
  private sensorValues: Map<string, unknown> = new Map();
  private entityDefinitions: Map<number, EspHomeEntity> = new Map();
  private entityNameIdMap: Map<string, string> = new Map();
  private captureInProgress = false;
  private consecutiveCameraFailures = 0;

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
        this.entityNameIdMap.set(entity.objectId, entity.name);
        this.entityNameIdMap.set(entity.name, entity.objectId);
        console.log(entity);

        // Detect camera entities
        if ('type' in entity && entity.type === 'camera') {
          this.state.hasCamera = true;
          this.state.cameraStatus =
            this.config.cameraEnabled === false ? 'disabled' : 'ok';
          console.log(`Detected camera in ${this.device.name}`);
        }
      }
      console.log(this.entityNameIdMap);
    });

    // this.client.on('deviceInfo', (info) => {
    // console.dir(info);
    // });

    this.client.on('sensor', ({ entity, state }) => {
      this.sensorValues.set(this.getEntityId(entity), state);

      // Capture drink data whenever it arrives if we have an active event
      if (this.currentEvent && state) {
        if (entity === this.entityNameIdMap.get('last_drink_amount')) {
          console.log(`Last drink amount updated: ${state}ml`);
          this.currentEvent.data.amount = Math.round(state);
        }
        if (entity === this.entityNameIdMap.get('last_drink_duration')) {
          console.log(`Last drink duration updated: ${state}s`);
          this.currentEvent.data.duration = Math.round(state);
        }
      }
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

      if (entity === this.entityNameIdMap.get('pump_status')) {
        this.state.pumpStatus = state ? 'error' : 'ok';
        return;
      }

      if (entity !== this.entityNameIdMap.get('activity')) {
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

        // Get linked camera (which could be itself) and take a snapshot
        const camera = await this.deps.directory.getLinkedCamera(this.deviceId);
        if (camera) {
          this.pendingSnapshot =
            (await camera.captureSnapshot({
              timestamp: date,
              eventType: 'water_intake',
            })) || null;
        }
      } else {
        // Activity just ended
        console.log('Activity ended. Checking for drink data...');

        // Check if we already have the data (arrived before activity ended)
        if (
          this.currentEvent &&
          this.currentEvent.data.amount > 0 &&
          this.currentEvent.data.duration &&
          this.currentEvent.data.duration > 0
        ) {
          console.log('Drink data already captured, saving immediately.');
          const eventToSave = this.currentEvent;
          const snapshotToSave = this.pendingSnapshot;
          this.currentEvent = null;
          this.pendingSnapshot = null;
          this.saveDrinkEvent(eventToSave, snapshotToSave);
        } else {
          // Data not yet available, wait for it
          console.log('Waiting for drink data...');
          this.captureNextDrinkData();
        }
      }
    });
  }

  private captureNextDrinkData() {
    if (!this.currentEvent) {
      console.warn('No active drink event to capture data for.');
      return;
    }

    const onSensorUpdate = (event: SensorEvent) => {
      console.debug('Sensor update during drink event:', event);
      const { data } = this.currentEvent!;

      if (
        event.entity === this.entityNameIdMap.get('last_drink_amount') &&
        !!event.state
      ) {
        data.amount = Math.round(event.state);
      } else if (
        event.entity === this.entityNameIdMap.get('last_drink_duration') &&
        !!event.state
      ) {
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
    }, 1000);
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

  async getSnapshotBuffer(): Promise<Buffer | undefined> {
    if (
      !this.state.hasCamera ||
      this.state.cameraStatus === 'disabled' ||
      this.state.cameraStatus === 'none' ||
      this.config.cameraEnabled === false
    ) {
      return undefined;
    }

    if (this.captureInProgress) {
      console.warn(
        `Camera capture already in progress for ${this.device.name}`,
      );
      return undefined;
    }

    this.captureInProgress = true;

    return new Promise<Buffer | undefined>((resolve) => {
      const timeout = setTimeout(() => {
        this.client.off('camera', onCameraImage);
        this.captureInProgress = false;
        this.consecutiveCameraFailures++;

        if (this.consecutiveCameraFailures >= 3) {
          this.state.cameraStatus = 'error';
          console.error(
            `Camera failed 3 times, marking as errored for ${this.device.name}`,
          );
        }

        console.error(`Camera snapshot timed out for ${this.device.name}`);
        resolve(undefined);
      }, 5000); // 5 second timeout

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onCameraImage = (payload: any) => {
        // Actual payload is { image: Buffer; name: string } not what types say
        if (
          !payload.image ||
          !Buffer.isBuffer(payload.image) ||
          payload.image.length === 0
        ) {
          return;
        }

        clearTimeout(timeout);
        this.client.off('camera', onCameraImage);
        this.captureInProgress = false;
        this.consecutiveCameraFailures = 0;
        this.state.cameraStatus = 'ok';
        resolve(payload.image);
      };

      this.client.on('camera', onCameraImage);

      try {
        this.client.sendCameraImageRequest(true);
      } catch (error) {
        clearTimeout(timeout);
        this.client.off('camera', onCameraImage);
        this.captureInProgress = false;
        this.consecutiveCameraFailures++;

        if (this.consecutiveCameraFailures >= 3) {
          this.state.cameraStatus = 'error';
        }

        console.error(
          `Failed to request camera image for ${this.device.name}:`,
          error,
        );
        resolve(undefined);
      }
    });
  }

  async captureSnapshot(options: {
    timestamp: Date;
    eventType: EventType;
    crop?: { left: number; top: number; width: number; height: number };
    rotate?: number;
  }): Promise<PendingMedia | undefined> {
    if (
      !this.state.hasCamera ||
      this.state.cameraStatus === 'disabled' ||
      this.state.cameraStatus === 'none'
    ) {
      return undefined;
    }

    try {
      const buffer = await this.getSnapshotBuffer();
      if (!buffer) {
        return undefined;
      }

      const image = sharp(buffer);
      const metadata = await image.metadata();

      const pendingMedia = await this.deps.mediaManager.createPendingMedia(
        'jpg',
        {
          height: metadata.height,
          width: metadata.width,
        },
      );

      let pipeline = sharp(buffer);

      if (options.crop) {
        const { left, top, width, height } = options.crop;
        let absCrop = { left, top, width, height };

        // If all crop values are <= 1, assume they are normalized (0-1) and convert to absolute pixels
        if (left <= 1 && top <= 1 && width <= 1 && height <= 1) {
          absCrop = {
            left: Math.round(left * metadata.width!),
            top: Math.round(top * metadata.height!),
            width: Math.round(width * metadata.width!),
            height: Math.round(height * metadata.height!),
          };
        }

        pipeline = pipeline.extract(absCrop);
      }

      if (options.rotate) {
        pipeline = pipeline.rotate(options.rotate);
      }

      await pipeline.toFile(pendingMedia.path);

      console.log(
        `Snapshot saved to ${pendingMedia.path} for event ${options.eventType}`,
      );
      return pendingMedia;
    } catch (error) {
      console.error(
        `Error capturing snapshot for fountain ${this.device.name}:`,
        error,
      );
      this.consecutiveCameraFailures++;

      if (this.consecutiveCameraFailures >= 3) {
        this.state.cameraStatus = 'error';
      }

      return undefined;
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
    return this.entityNameIdMap.get(name)!;
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
