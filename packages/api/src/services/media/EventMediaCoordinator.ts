import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import type { DeviceCameraConfig } from '../../database/types/DeviceCameraTable.ts';
import type { EventType } from 'shared';
import type { DeviceDirectory, RecordingSource } from '../devices/types.ts';
import type {
  EventBus,
  ActivityStartEvent,
  DeviceEvent,
  DeviceMediaReadyEvent,
} from '../devices/EventBus.ts';
import type { MediaManager } from './MediaManager.ts';
import type { PendingMedia } from './MediaManager.ts';

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface PendingDeviceMedia {
  snapshot?: PendingMedia;
  ttlTimer?: ReturnType<typeof setTimeout>;
}

function getEventEndTime(event: DeviceEvent): Date {
  const data = event.data as { duration?: number };
  const durationSeconds = typeof data?.duration === 'number' ? data.duration : 120;
  return new Date(
    event.timestamp.getTime() + durationSeconds * 1000,
  );
}

export class EventMediaCoordinator {
  private db: Kysely<Database>;
  private eventBus: EventBus;
  private mediaManager: MediaManager;
  private directory: DeviceDirectory;
  private pendingByDevice = new Map<number, PendingDeviceMedia>();
  /** In-flight activity.start snapshot work; `handleDeviceEvent` awaits this so pending is populated. */
  private snapshotWorkByDevice = new Map<number, Promise<void>>();
  private recordingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private onActivityStartBound: (event: ActivityStartEvent) => void;
  private onDeviceEventBound: (event: DeviceEvent) => void;

  constructor(
    db: Kysely<Database>,
    eventBus: EventBus,
    mediaManager: MediaManager,
    directory: DeviceDirectory,
  ) {
    this.db = db;
    this.eventBus = eventBus;
    this.mediaManager = mediaManager;
    this.directory = directory;
    this.onActivityStartBound = this.onActivityStart.bind(this);
    this.onDeviceEventBound = this.onDeviceEvent.bind(this);
  }

  async initialize(): Promise<void> {
    this.eventBus.subscribe(
      'device.activity.start',
      this.onActivityStartBound as (e: unknown) => void,
    );
    this.eventBus.subscribe(
      'device.event',
      this.onDeviceEventBound as (e: unknown) => void,
    );
  }

  async shutdown(): Promise<void> {
    this.eventBus.removeListener(
      'device.activity.start',
      this.onActivityStartBound as (e: unknown) => void,
    );
    this.eventBus.removeListener(
      'device.event',
      this.onDeviceEventBound as (e: unknown) => void,
    );
    for (const id of this.recordingTimeouts) {
      clearTimeout(id);
    }
    this.recordingTimeouts.clear();
    for (const pending of this.pendingByDevice.values()) {
      if (pending.ttlTimer) clearTimeout(pending.ttlTimer);
      if (pending.snapshot) pending.snapshot.cleanup().catch(() => {});
    }
    this.pendingByDevice.clear();
    this.snapshotWorkByDevice.clear();
  }

  private async awaitSnapshotCaptureIfAny(deviceId: number): Promise<void> {
    const p = this.snapshotWorkByDevice.get(deviceId);
    if (p) await p;
  }

  private beginTrackedSnapshotWork(deviceId: number, work: Promise<void>): void {
    this.snapshotWorkByDevice.set(deviceId, work);
    work.finally(() => {
      if (this.snapshotWorkByDevice.get(deviceId) === work) {
        this.snapshotWorkByDevice.delete(deviceId);
      }
    });
    work.catch((err) => {
      console.error('[EventMediaCoordinator] activity.start error:', err);
    });
  }

  private async getLinkConfig(
    deviceId: number,
  ): Promise<{ cameraId: number; config: DeviceCameraConfig | null } | null> {
    const row = await this.db
      .selectFrom('device_camera')
      .where('device_id', '=', deviceId)
      .select(['camera_id', 'config'])
      .executeTakeFirst();
    if (!row) return null;
    return {
      cameraId: row.camera_id,
      config: row.config as DeviceCameraConfig | null,
    };
  }

  private onActivityStart(event: ActivityStartEvent): void {
    this.beginTrackedSnapshotWork(
      event.deviceId,
      this.performActivitySnapshot(event.deviceId, event.timestamp),
    );
  }

  /**
   * Runs the activity.start snapshot pipeline. Returned promise is tracked so
   * `handleDeviceEvent` can await it before reading `pendingByDevice`.
   */
  private async performActivitySnapshot(
    deviceId: number,
    timestamp: Date,
  ): Promise<void> {
    const link = await this.getLinkConfig(deviceId);
    if (!link) return;

    const acquisitionTypes = link.config?.acquisitionTypes ?? ['snapshot'];
    if (!acquisitionTypes.includes('snapshot')) return;

    const camera = await this.directory.getLinkedCamera(deviceId);
    if (!camera) return;

    const snapshot = await camera.captureSnapshot({
      timestamp,
    });
    if (!snapshot) return;

    const existing = this.pendingByDevice.get(deviceId);
    if (existing?.ttlTimer) clearTimeout(existing.ttlTimer);

    const ttlTimer = setTimeout(() => {
      this.pendingByDevice.delete(deviceId);
      snapshot.cleanup().catch(() => {});
    }, PENDING_TTL_MS);

    this.pendingByDevice.set(deviceId, {
      snapshot,
      ttlTimer,
    });
  }

  private onDeviceEvent(event: DeviceEvent): void {
    this.handleDeviceEvent(event).catch((err) => {
      console.error('[EventMediaCoordinator] device.event error:', err);
    });
  }

  private publishMediaReady(
    event: DeviceEvent,
    linkedMediaIds: number[],
  ): void {
    const mediaReadyEvent: DeviceMediaReadyEvent = {
      deviceId: event.deviceId,
      eventId: event.eventId,
      type: event.type,
      timestamp: event.timestamp,
      mediaReady: true,
      linkedMediaIds,
    };

    this.eventBus.publish('device.event.media_ready', mediaReadyEvent);
  }

  private async handleDeviceEvent(event: DeviceEvent): Promise<void> {
    const { deviceId, eventId, timestamp } = event;

    await this.awaitSnapshotCaptureIfAny(deviceId);

    const link = await this.getLinkConfig(deviceId);
    if (!link) return;

    const acquisitionTypes = link.config?.acquisitionTypes ?? ['snapshot'];

    // 1. Persist and link pending snapshot from activity start
    const pending = this.pendingByDevice.get(deviceId);
    if (pending?.ttlTimer) {
      clearTimeout(pending.ttlTimer);
      pending.ttlTimer = undefined;
    }
    this.pendingByDevice.delete(deviceId);

    if (pending?.snapshot && acquisitionTypes.includes('snapshot')) {
      try {
        const media = await this.mediaManager.persistMedia(
          pending.snapshot.path,
          pending.snapshot.metadata,
          'image/jpeg',
        );
        await this.mediaManager.linkMediaToEvent(media.id, eventId, 'snapshot');
        this.publishMediaReady(event, [media.id]);
      } catch (err) {
        console.error('[EventMediaCoordinator] Failed to persist snapshot:', err);
        await pending.snapshot.cleanup().catch(() => {});
      }
    } else if (pending?.snapshot) {
      await pending.snapshot.cleanup().catch(() => {});
    }

    // 2. Schedule recording fetch (with delay)
    if (!acquisitionTypes.includes('recording')) return;

    const cameraController = await this.directory.instantiateController(
      link.cameraId,
    );
    if (!cameraController || !('fetchRecording' in cameraController)) return;

    const recordingSource = cameraController as RecordingSource;
    const fetchDelay = (link.config?.fetchDelay ?? 0) * 1000;
    const startTime = timestamp;
    const endTime = getEventEndTime(event);
    const transforms = link.config
      ? {
          crop: link.config.crop,
          rotate: link.config.rotate,
        }
      : undefined;

    const timeoutId = setTimeout(() => {
      this.recordingTimeouts.delete(timeoutId);
      this.runRecordingFetch(
        recordingSource,
        eventId,
        startTime,
        endTime,
        event.type as EventType,
        transforms,
      ).catch((err) => {
        console.error('[EventMediaCoordinator] Recording fetch failed:', err);
      });
    }, fetchDelay);
    this.recordingTimeouts.add(timeoutId);
  }

  private async runRecordingFetch(
    camera: RecordingSource,
    eventId: number,
    startTime: Date,
    endTime: Date,
    eventType: EventType,
    transforms: { crop?: DeviceCameraConfig['crop']; rotate?: number } | undefined,
  ): Promise<void> {
    try {
      const result = await camera.fetchRecording({
        startTime,
        endTime,
        eventType,
        transforms,
      });

      if (result.type === 'local') {
        const media = await this.mediaManager.persistMedia(
          result.pendingMedia.path,
          result.pendingMedia.metadata,
          result.mimeType,
        );
        await this.mediaManager.linkMediaToEvent(
          media.id,
          eventId,
          'recording',
        );
        await result.pendingMedia.cleanup().catch(() => {});
      }
      // Future: handle result.type === 'remote'
    } catch (err) {
      console.error('[EventMediaCoordinator] fetchRecording error:', err);
      throw err;
    }
  }
}
