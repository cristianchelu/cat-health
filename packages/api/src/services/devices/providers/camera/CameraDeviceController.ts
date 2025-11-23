import sharp from 'sharp';
import type { DeviceStatus } from 'shared';
import type { Camera, ProviderDeps, Device } from '../../types.ts';
import type { EventType } from '../../../../database/types/EventTable.ts';
import type { PendingMedia } from '../../../media/MediaManager.ts';

interface CameraConfig {
  snapshotUrl: string;
  snapshotAuth?: string;
}

export class CameraDeviceController implements Camera {
  readonly deviceId: number;
  private config: CameraConfig;
  private status: DeviceStatus = 'unknown';
  private device: Device;
  private deps: ProviderDeps;

  constructor(device: Device, deps: ProviderDeps) {
    this.device = device;
    this.deps = deps;
    this.deviceId = device.id;

    const rawConfig = device.config as unknown as CameraConfig;
    this.config = {
      snapshotUrl: rawConfig.snapshotUrl,
      snapshotAuth: rawConfig.snapshotAuth,
    };
  }

  async connect(): Promise<void> {
    this.status = 'online';
  }

  async disconnect(): Promise<void> {
    this.status = 'offline';
  }

  getStatus() {
    return this.status;
  }

  async captureSnapshot(options: {
    timestamp: Date;
    eventType: EventType;
    crop?: { left: number; top: number; width: number; height: number };
    rotate?: number;
  }): Promise<PendingMedia | undefined> {
    if (!this.config.snapshotUrl) {
      console.warn(`No snapshot URL configured for camera ${this.device.name}`);
      return undefined;
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

      const pendingMedia =
        await this.deps.mediaManager.createPendingMedia('jpg');

      let pipeline = sharp(await response.arrayBuffer());

      if (options.crop) {
        pipeline = pipeline.extract(options.crop);
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
        `Error capturing snapshot for camera ${this.device.name}:`,
        error,
      );
      return undefined;
    }
  }
}
