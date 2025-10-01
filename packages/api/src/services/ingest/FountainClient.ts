import path from 'path';

import { EspHomeClient, LogLevel, type SensorEvent } from 'esphome-client';
import sharp from 'sharp';
import type {
  NewEvent,
  WaterIntakeEventData,
} from '../../database/types/EventTable.ts';
import { generateOutputFilename } from '../../helpers/events.ts';

interface FountainClientConfig {
  host: string;
  port?: number;
  encryptionKey?: string;
  clientId?: string;
  snapshotUrl?: string;
  snapshotAuth?: string;
}

export class FountainClient {
  private client: EspHomeClient;
  private config: FountainClientConfig;
  private currentEvent: NewEvent<WaterIntakeEventData> | null = null;

  constructor(config: FountainClientConfig) {
    this.config = config;
    this.client = new EspHomeClient({
      host: config.host,
      port: config.port ?? 6053,
      psk: config.encryptionKey,
      clientId: config.clientId ?? 'cat-health-api',
    });

    this.setupListeners();
  }

  private setupListeners() {
    const info = this.client.deviceInfo();
    this.client.on('connect', () => {
      console.log(`Connected to ${info?.friendlyName}`);
      this.client.subscribeToLogs(LogLevel.INFO);
    });

    this.client.on('deviceInfo', (info) => {
      console.log(`Device: ${info.name} v${info.esphomeVersion}`);
    });

    this.client.on('binary_sensor', (data) => {
      if (data.entity !== 'Activity') {
        return;
      }

      if (data.state === true) {
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
          device_id: 2, // TODO: un-hardcode device ID
        };
        this.captureSnapshot(date);
      } else {
        // Activity just ended, the next sensor updates will be what we want
        console.log('Activity detected. Waiting for drink data...');
        this.captureNextDrinkData();
      }
    });

    this.client.on('disconnect', () => {
      console.error(`Disconnected from ${info?.friendlyName}`);
    });
  }

  public async captureSnapshot(date: Date) {
    if (!this.config.snapshotUrl) {
      console.warn('No snapshot URL configured.');
      return;
    }

    try {
      const headers = this.config.snapshotAuth
        ? {
            Authorization: `Basic ${Buffer.from(this.config.snapshotAuth).toString('base64')}`,
          }
        : undefined;
      const response = await fetch(this.config.snapshotUrl, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch snapshot: ${response.statusText}`);
      }

      const filename = generateOutputFilename(date, 'water_intake', 'jpg');
      const imagePath = process.env.IMAGE_PATH || './images';

      sharp(await response.arrayBuffer())
        .extract({ left: 920, top: 380, width: 512, height: 512 })
        .rotate(-90)
        .toFile(path.join(imagePath, filename));

      console.log(`Snapshot saved to ${imagePath}`);
    } catch (error) {
      console.error('Error capturing snapshot:', error);
    }
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
      if (data.amount && data.duration) {
        this.saveDrinkEvent();
        this.currentEvent = null;
        this.client.off('sensor', onSensorUpdate);
      }
    };

    this.client.on('sensor', onSensorUpdate);

    setTimeout(() => {
      if (this.currentEvent) {
        console.warn('Timed out waiting for drink data.');
        this.client.off('sensor', onSensorUpdate);
        this.currentEvent = null;
      }
    }, 1000);
  }

  private saveDrinkEvent() {
    console.log('--- SAVING DRINK EVENT ---');
    console.log(`Device: ${this.config.host}`);
    console.log(`Amount: ${this.currentEvent?.data.amount}ml`);
    console.log(`Duration: ${this.currentEvent?.data.duration}s`);
    console.log('--------------------------');

    // TODO: Add database persistence logic here.
    // This would involve creating a new EventTable record.

    this.currentEvent = null;
  }

  public async connect() {
    try {
      this.client.connect();
    } catch (error) {
      console.error(`Failed to connect to ${this.config.host}:`, error);
    }
  }

  public disconnect() {
    this.client.disconnect();
  }
}
