import sharp from 'sharp';
import type { DeviceStatus } from 'shared';
import { requireWithSchema } from 'shared';
import type { Camera, ProviderDeps, Device } from '../../types.ts';
import type { PendingMedia } from '../../../media/MediaManager.ts';
import { type Static, Type } from '@fastify/type-provider-typebox';

export const CameraConfigSchema = Type.Object({
  snapshotUrl: Type.String(),
  snapshotAuth: Type.Optional(Type.String()),
});
export type CameraConfig = Static<typeof CameraConfigSchema>;

export class CameraDeviceController implements Camera {
  readonly deviceId: number;
  private config: CameraConfig;
  private status: DeviceStatus = 'unknown';
  private device: Device;
  protected deps: ProviderDeps;

  constructor(device: Device, deps: ProviderDeps) {
    this.device = device;
    this.deps = deps;
    this.deviceId = device.id;

    this.config = requireWithSchema(
      CameraConfigSchema,
      device.config,
      'camera configuration',
    );

    // If snapshotUrl contains credentials, extract them and clean the URL
    try {
      const url = new URL(this.config.snapshotUrl);
      if (url.username || url.password) {
        if (!this.config.snapshotAuth) {
          this.config.snapshotAuth = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
        }
        url.username = '';
        url.password = '';
        this.config.snapshotUrl = url.toString();
      }
    } catch {
      // Ignore invalid URLs, they will fail later
    }
  }

  async connect(): Promise<void> {
    this.status = 'online';
    if (this.deviceId !== 0) {
      this.deps.presence.reportOnline(this.deviceId);
    }
  }

  async disconnect(): Promise<void> {
    this.status = 'offline';
    if (this.deviceId !== 0) {
      this.deps.presence.reportOffline(this.deviceId);
    }
  }

  getStatus() {
    return this.status;
  }

  async captureSnapshot(options: {
    timestamp: Date;
    crop?: { left: number; top: number; width: number; height: number };
    rotate?: number;
  }): Promise<PendingMedia | undefined> {
    if (!this.config.snapshotUrl) {
      console.warn(`No snapshot URL configured for camera ${this.device.name}`);
      return undefined;
    }

    try {
      const buffer = await this.getSnapshotBuffer();
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
            left: Math.round(left * metadata.width),
            top: Math.round(top * metadata.height),
            width: Math.round(width * metadata.width),
            height: Math.round(height * metadata.height),
          };
        }

        pipeline = pipeline.extract(absCrop);
      }

      if (options.rotate) {
        pipeline = pipeline.rotate(options.rotate);
      }

      await pipeline.toFile(pendingMedia.path);

      console.log(`Snapshot saved to ${pendingMedia.path}`);
      if (this.deviceId !== 0) {
        this.deps.presence.recordActivity(this.deviceId);
      }
      return pendingMedia;
    } catch (error) {
      console.error(
        `Error capturing snapshot for camera ${this.device.name}:`,
        error,
      );
      throw error;
    }
  }

  async getSnapshotBuffer(): Promise<Buffer> {
    if (!this.config.snapshotUrl) {
      throw new Error(
        `No snapshot URL configured for camera ${this.device.name}`,
      );
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

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.error(
        `Error fetching snapshot for camera ${this.device.name}:`,
        error,
      );
      throw error;
    }
  }
}
