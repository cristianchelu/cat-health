import { type Entity as EspHomeEntity } from 'esphome-client';
import sharp from 'sharp';
import type { EventType, WaterFountainState } from 'shared';
import type { Camera, ProviderDeps, Device } from '../../types.ts';
import type { PendingMedia } from '../../../media/MediaManager.ts';
import type {
  NewEvent,
  WaterIntakeEventData,
} from '../../../../database/types/EventTable.ts';
import {
  BaseESPHomeController,
  type ReconnectConfig,
} from './BaseESPHomeController.ts';

interface FountainConfig {
  host: string;
  port?: number;
  encryptionKey?: string;
  clientId?: string;
}

const SENSORS = {
  ACTIVITY: 'activity',
  PUMP_STATUS: 'pump_status',
  WATER_LEVEL: 'water_level',
  LAST_DRINK_AMOUNT: 'last_drink_amount',
  LAST_DRINK_DURATION: 'last_drink_duration',
  // Optional sensors for fountain-specific features
  WATER_CHANGE_DAYS_REMAINING: 'water_change_days_remaining',
  FILTER_CHANGE_DAYS_REMAINING: 'filter_change_days_remaining',
} as const;

export class FountainController
  extends BaseESPHomeController
  implements Camera {
  private currentEvent: NewEvent<WaterIntakeEventData> | null = null;
  private pendingSnapshot: PendingMedia | null = null;
  private state: WaterFountainState = {
    waterLevel: 0,
  };
  private captureInProgress = false;

  constructor(device: Device, deps: ProviderDeps) {
    super(device, deps);
  }

  protected get deviceTypeName(): string {
    return 'fountain';
  }

  protected get reconnectConfig(): ReconnectConfig {
    return {
      baseDelay: 1000,
      maxDelay: 5000,
      heartbeatTimeout: 3000,
      pingInterval: 1000,
    };
  }

  protected onConnected(): void {
    // No additional setup needed on connect
  }

  protected onEntitiesReceived(entities: EspHomeEntity[]): void {
    // Detect camera entities
    for (const entity of entities) {
      if ('type' in entity && entity.type === 'camera') {
        this.state.hasCamera = true;
        console.log(`Detected camera in ${this.device.name}`);
      }
    }

    // Detect fountain-specific features and initialize state for sensors that exist
    const pumpStatusKey = this.getEntityKey(SENSORS.PUMP_STATUS);
    if (pumpStatusKey !== null) {
      this.state.pumpStatus = 'ok';
      console.log(`Detected pump_status sensor in ${this.device.name}`);
    }

    const waterDaysKey = this.getEntityKey(SENSORS.WATER_CHANGE_DAYS_REMAINING);
    if (waterDaysKey !== null) {
      this.state.waterDaysRemaining = 0;
      console.log(`Detected water_change_days_remaining sensor in ${this.device.name}`);
    }

    const filterDaysKey = this.getEntityKey(SENSORS.FILTER_CHANGE_DAYS_REMAINING);
    if (filterDaysKey !== null) {
      this.state.filterDaysRemaining = 0;
      console.log(`Detected filter_change_days_remaining sensor in ${this.device.name}`);
    }
  }

  protected handleSensorUpdate(key: number, state: unknown): void {
    const waterLevelKey = this.getEntityKey(SENSORS.WATER_LEVEL);
    if (waterLevelKey !== null && key === waterLevelKey) {
      this.state.waterLevel = Math.round(state as number);
      return;
    }

    // Handle pump status (optional entity - some fountains don't have it)
    const pumpStatusKey = this.getEntityKey(SENSORS.PUMP_STATUS);
    if (pumpStatusKey !== null && key === pumpStatusKey) {
      this.state.pumpStatus = state ? 'error' : 'ok';
      return;
    }

    // Handle water change days remaining (optional)
    const waterDaysKey = this.getEntityKey(SENSORS.WATER_CHANGE_DAYS_REMAINING);
    if (waterDaysKey !== null && key === waterDaysKey) {
      this.state.waterDaysRemaining = Math.round(state as number);
      return;
    }

    // Handle filter change days remaining (optional)
    const filterDaysKey = this.getEntityKey(SENSORS.FILTER_CHANGE_DAYS_REMAINING);
    if (filterDaysKey !== null && key === filterDaysKey) {
      this.state.filterDaysRemaining = Math.round(state as number);
      return;
    }

    // Capture drink data whenever it arrives if we have an active event
    if (this.currentEvent && state) {
      const drinkAmountKey = this.getEntityKey(SENSORS.LAST_DRINK_AMOUNT);
      const drinkDurationKey = this.getEntityKey(SENSORS.LAST_DRINK_DURATION);
      if (drinkAmountKey !== null && key === drinkAmountKey) {
        console.log(`Last drink amount updated: ${state}ml`);
        this.currentEvent.data.amount = Math.round(state as number);
      }
      if (drinkDurationKey !== null && key === drinkDurationKey) {
        console.log(`Last drink duration updated: ${state}s`);
        this.currentEvent.data.duration = Math.round(state as number);
      }
    }
  }

  protected setupListeners() {
    super.setupListeners();

    // Override binary_sensor handler to add activity tracking
    this.client.on('binary_sensor', async (data) => {
      const { key, state } = data;
      this.sensorValues.set(key, state);
      this.handleSensorUpdate(key, state);

      // Handle activity sensor for water intake events
      const activityKey = this.getEntityKey(SENSORS.ACTIVITY);
      if (activityKey !== null && key === activityKey) {
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
          const camera = await this.deps.directory.getLinkedCamera(
            this.deviceId,
          );
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
      }
    });
  }

  private captureNextDrinkData() {
    if (!this.currentEvent) {
      console.warn('No active drink event to capture data for.');
      return;
    }

    const drinkAmountKey = this.getEntityKey(SENSORS.LAST_DRINK_AMOUNT);
    const drinkDurationKey = this.getEntityKey(SENSORS.LAST_DRINK_DURATION);

    const onSensorUpdate = (event: { key: number; state?: number }) => {
      console.debug('Sensor update during drink event:', event);
      const { data } = this.currentEvent!;

      if (drinkAmountKey !== null && event.key === drinkAmountKey && event.state != null) {
        data.amount = Math.round(event.state);
      } else if (
        drinkDurationKey !== null &&
        event.key === drinkDurationKey &&
        event.state != null
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
    if (!this.state.hasCamera) {
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
        resolve(payload.image);
      };

      this.client.on('camera', onCameraImage);

      try {
        this.client.sendCameraImageRequest(true);
      } catch (error) {
        clearTimeout(timeout);
        this.client.off('camera', onCameraImage);
        this.captureInProgress = false;
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
    if (!this.state.hasCamera) {
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
      return undefined;
    }
  }

  getState() {
    return {
      ...this.state,
      ...super.getState(),
    };
  }
}
