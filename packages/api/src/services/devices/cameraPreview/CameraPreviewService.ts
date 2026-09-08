import type { Kysely } from 'kysely';
import type { Database } from '../../../database/index.ts';
import { isCamera } from '../types.ts';
import type { DeviceDirectory } from '../types.ts';
import { CameraPreviewCache } from './CameraPreviewCache.ts';
import { CameraIdlePoller } from './CameraIdlePoller.ts';
import {
  composeAtlas,
  EMPTY_ATLAS_LAYOUT,
  renderPreviewCell,
  type AtlasLayout,
  type AtlasResult,
  type AtlasCellInput,
} from './composeAtlas.ts';
import { loadPreviewWatchers } from './loadPreviewWatchers.ts';

export type CameraPreviewDirectory = DeviceDirectory;

/**
 * Last-frame cache, idle poller, and on-demand atlas. The compositor never
 * fetches — it peeks the cache and applies each watcher's ROI.
 */
export class CameraPreviewService {
  readonly cache: CameraPreviewCache;
  private readonly db: Kysely<Database>;
  private readonly directory: CameraPreviewDirectory;
  private readonly poller: CameraIdlePoller;
  private composed:
    | { key: number; result: AtlasResult }
    | { key: number; result: undefined }
    | undefined;

  constructor(
    db: Kysely<Database>,
    directory: CameraPreviewDirectory,
    cache: CameraPreviewCache = new CameraPreviewCache(),
  ) {
    this.db = db;
    this.directory = directory;
    this.cache = cache;
    this.poller = new CameraIdlePoller({
      loadWatchers: () => loadPreviewWatchers(this.db, this.directory),
      fetchSnapshot: (cameraId) => this.fetchSnapshot(cameraId),
      remember: (cameraId, jpeg) => this.remember(cameraId, jpeg),
    });
  }

  start(): void {
    this.poller.start();
  }

  stop(): void {
    this.poller.stop();
  }

  remember(cameraId: number, jpeg: Buffer): void {
    this.cache.remember(cameraId, jpeg);
    this.composed = undefined;
  }

  forget(cameraId: number): void {
    this.cache.forget(cameraId);
    this.composed = undefined;
  }

  async getLayout(): Promise<AtlasLayout> {
    const atlas = await this.getAtlas();
    return atlas?.layout ?? EMPTY_ATLAS_LAYOUT;
  }

  async getAtlas(): Promise<AtlasResult | undefined> {
    const inputs = await this.atlasInputs();
    const key = inputs.reduce(
      (hash, cell) => hash + cell.deviceId * 33 + cell.capturedAt,
      0,
    );
    if (this.composed?.key === key) return this.composed.result;

    const result = inputs.length === 0 ? undefined : await composeAtlas(inputs);
    this.composed = { key, result };
    return result;
  }

  async getThumbnail(deviceId: number): Promise<Buffer | undefined> {
    const watchers = await loadPreviewWatchers(this.db, this.directory);
    const watcher = watchers.find((entry) => entry.deviceId === deviceId);
    if (watcher) {
      const frame = await this.peekOrFetch(watcher.cameraId);
      if (!frame) return undefined;
      return renderPreviewCell({
        deviceId: watcher.deviceId,
        jpeg: frame.jpeg,
        capturedAt: frame.capturedAt,
        crop: watcher.crop,
        rotate: watcher.rotate,
      });
    }

    const controller = await this.directory.instantiateController(deviceId);
    if (!controller || !isCamera(controller)) return undefined;

    const frame = await this.peekOrFetch(deviceId);
    return frame?.jpeg;
  }

  private async peekOrFetch(cameraId: number) {
    const peeked = this.cache.peek(cameraId);
    if (peeked) return peeked;
    const jpeg = await this.fetchSnapshot(cameraId);
    if (!jpeg) return undefined;
    this.remember(cameraId, jpeg);
    return this.cache.peek(cameraId);
  }

  private async atlasInputs(): Promise<AtlasCellInput[]> {
    const watchers = await loadPreviewWatchers(this.db, this.directory);
    const inputs: AtlasCellInput[] = [];
    for (const watcher of watchers) {
      const frame = this.cache.peek(watcher.cameraId);
      if (!frame) continue;
      inputs.push({
        deviceId: watcher.deviceId,
        jpeg: frame.jpeg,
        capturedAt: frame.capturedAt,
        crop: watcher.crop,
        rotate: watcher.rotate,
      });
    }
    return inputs;
  }

  private async fetchSnapshot(cameraId: number): Promise<Buffer | undefined> {
    const controller = await this.directory.instantiateController(cameraId);
    if (!controller || !isCamera(controller)) return undefined;
    return controller.getSnapshotBuffer();
  }
}
