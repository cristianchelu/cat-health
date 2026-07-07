import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import type { DeviceCameraConfig } from '../../database/types/DeviceCameraTable.ts';
import type { EventType } from 'shared';
import type {
  Camera,
  DeviceDirectory,
  RecordingSource,
} from '../devices/types.ts';
import type {
  EventBus,
  ActivityStartEvent,
  ActivityEndEvent,
  DeviceEvent,
  DeviceMediaReadyEvent,
} from '../devices/EventBus.ts';
import type { MediaManager } from './MediaManager.ts';
import type { PendingMedia } from './MediaManager.ts';

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface PendingDeviceMedia {
  frames: PendingMedia[];
  intervalSec: number;
  firstFrameDelaySec: number;
  intervalId?: ReturnType<typeof setInterval>;
  firstFrameTimeoutId?: ReturnType<typeof setTimeout>;
  ttlTimer?: ReturnType<typeof setTimeout>;
  captureInFlight?: Promise<void>;
  active: boolean;
}

function getEventEndTime(event: DeviceEvent): Date {
  const data = event.data as { duration?: number };
  const durationSeconds =
    typeof data?.duration === 'number' ? data.duration : 120;
  return new Date(event.timestamp.getTime() + durationSeconds * 1000);
}

function getSnapshotTransforms(config: DeviceCameraConfig | null) {
  if (!config) return undefined;
  return {
    crop: config.crop,
    rotate: config.rotate,
  };
}

export class EventMediaCoordinator {
  private db: Kysely<Database>;
  private eventBus: EventBus;
  private mediaManager: MediaManager;
  private directory: DeviceDirectory;
  private pendingByDevice = new Map<number, PendingDeviceMedia>();
  /** In-flight activity.start setup work; `handleDeviceEvent` awaits this so pending is populated. */
  private snapshotWorkByDevice = new Map<number, Promise<void>>();
  private recordingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private onActivityStartBound: (event: ActivityStartEvent) => void;
  private onActivityEndBound: (event: ActivityEndEvent) => void;
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
    this.onActivityEndBound = this.onActivityEnd.bind(this);
    this.onDeviceEventBound = this.onDeviceEvent.bind(this);
  }

  async initialize(): Promise<void> {
    this.eventBus.subscribe(
      'device.activity.start',
      this.onActivityStartBound as (e: unknown) => void,
    );
    this.eventBus.subscribe(
      'device.activity.end',
      this.onActivityEndBound as (e: unknown) => void,
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
      'device.activity.end',
      this.onActivityEndBound as (e: unknown) => void,
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
      this.stopCaptureLoop(pending);
      if (pending.ttlTimer) clearTimeout(pending.ttlTimer);
      this.cleanupPendingFrames(pending).catch(() => {});
    }
    this.pendingByDevice.clear();
    this.snapshotWorkByDevice.clear();
  }

  private stopCaptureLoop(pending: PendingDeviceMedia): void {
    if (pending.intervalId) {
      clearInterval(pending.intervalId);
      pending.intervalId = undefined;
    }
    if (pending.firstFrameTimeoutId) {
      clearTimeout(pending.firstFrameTimeoutId);
      pending.firstFrameTimeoutId = undefined;
    }
    pending.active = false;
  }

  private async cleanupPendingFrames(
    pending: PendingDeviceMedia,
  ): Promise<void> {
    await Promise.all(pending.frames.map((f) => f.cleanup().catch(() => {})));
    pending.frames = [];
  }

  private async awaitPendingCaptures(deviceId: number): Promise<void> {
    const setupWork = this.snapshotWorkByDevice.get(deviceId);
    if (setupWork) await setupWork;

    const pending = this.pendingByDevice.get(deviceId);
    if (pending?.captureInFlight) await pending.captureInFlight;
  }

  private beginTrackedSnapshotWork(
    deviceId: number,
    work: Promise<void>,
  ): void {
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

  private schedulePendingCleanup(deviceId: number): void {
    const pending = this.pendingByDevice.get(deviceId);
    if (!pending) return;

    if (pending.ttlTimer) clearTimeout(pending.ttlTimer);

    pending.ttlTimer = setTimeout(() => {
      const current = this.pendingByDevice.get(deviceId);
      if (!current) return;
      this.pendingByDevice.delete(deviceId);
      this.cleanupPendingFrames(current).catch(() => {});
    }, PENDING_TTL_MS);
  }

  private onActivityStart(event: ActivityStartEvent): void {
    this.beginTrackedSnapshotWork(
      event.deviceId,
      this.startActivityCapture(event.deviceId, event.timestamp),
    );
  }

  private onActivityEnd(event: ActivityEndEvent): void {
    const pending = this.pendingByDevice.get(event.deviceId);
    if (!pending) return;

    this.stopCaptureLoop(pending);
    this.schedulePendingCleanup(event.deviceId);
  }

  /**
   * Runs the activity.start snapshot pipeline. Returned promise is tracked so
   * `handleDeviceEvent` can await it before reading `pendingByDevice`.
   */
  private async startActivityCapture(
    deviceId: number,
    timestamp: Date,
  ): Promise<void> {
    const link = await this.getLinkConfig(deviceId);
    if (!link) return;

    const acquisitionTypes = link.config?.acquisitionTypes ?? ['snapshot'];
    if (!acquisitionTypes.includes('snapshot')) return;

    const camera = await this.directory.getLinkedCamera(deviceId);
    if (!camera) return;

    const existing = this.pendingByDevice.get(deviceId);
    if (existing) {
      this.stopCaptureLoop(existing);
      if (existing.ttlTimer) clearTimeout(existing.ttlTimer);
      await this.cleanupPendingFrames(existing);
    }

    const transforms = getSnapshotTransforms(link.config);
    const intervalSec = link.config?.snapshot?.intervalSec ?? 0;
    const firstFrameDelaySec = link.config?.snapshot?.firstFrameDelaySec ?? 0;

    const pending: PendingDeviceMedia = {
      frames: [],
      active: true,
      intervalSec,
      firstFrameDelaySec,
    };
    this.pendingByDevice.set(deviceId, pending);

    const firstFrameDelayMs = Math.max(0, firstFrameDelaySec) * 1000;

    const captureTick = () => {
      if (!pending.active) return;
      void this.captureFrame(deviceId, camera, new Date(), transforms, pending);
    };

    if (intervalSec > 0) {
      pending.firstFrameTimeoutId = setTimeout(() => {
        pending.firstFrameTimeoutId = undefined;
        if (!pending.active) return;
        captureTick();
        pending.intervalId = setInterval(captureTick, intervalSec * 1000);
      }, firstFrameDelayMs);
    } else {
      pending.firstFrameTimeoutId = setTimeout(() => {
        pending.firstFrameTimeoutId = undefined;
        if (!pending.active) return;
        void this.captureFrame(
          deviceId,
          camera,
          timestamp,
          transforms,
          pending,
        );
      }, firstFrameDelayMs);
    }
  }

  private async captureFrame(
    deviceId: number,
    camera: Camera,
    timestamp: Date,
    transforms: ReturnType<typeof getSnapshotTransforms>,
    pending: PendingDeviceMedia,
  ): Promise<void> {
    if (pending.captureInFlight) return;

    const work = (async () => {
      const snapshot = await camera.captureSnapshot({
        timestamp,
        crop: transforms?.crop,
        rotate: transforms?.rotate,
      });
      if (snapshot) {
        pending.frames.push(snapshot);
      }
    })();

    pending.captureInFlight = work;
    await work
      .finally(() => {
        if (pending.captureInFlight === work) {
          pending.captureInFlight = undefined;
        }
      })
      .catch((err) => {
        console.error(
          `[EventMediaCoordinator] captureFrame error for device ${deviceId}:`,
          err,
        );
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
    if (event.type === 'device_connectivity') {
      return;
    }

    const { deviceId, eventId, timestamp } = event;

    const pending = this.pendingByDevice.get(deviceId);
    if (pending) {
      this.stopCaptureLoop(pending);
    }

    await this.awaitPendingCaptures(deviceId);

    const link = await this.getLinkConfig(deviceId);
    if (!link) return;

    const acquisitionTypes = link.config?.acquisitionTypes ?? ['snapshot'];

    const resolvedPending = this.pendingByDevice.get(deviceId);
    if (resolvedPending?.ttlTimer) {
      clearTimeout(resolvedPending.ttlTimer);
      resolvedPending.ttlTimer = undefined;
    }
    this.pendingByDevice.delete(deviceId);

    if (
      resolvedPending &&
      resolvedPending.frames.length > 0 &&
      acquisitionTypes.includes('snapshot')
    ) {
      const linkedMediaIds: number[] = [];
      try {
        for (let i = 0; i < resolvedPending.frames.length; i++) {
          const frame = resolvedPending.frames[i];
          const relation = i === 0 ? 'snapshot' : 'timelapse';
          const { intervalSec, firstFrameDelaySec } = resolvedPending;
          const captureOffsetSec =
            firstFrameDelaySec + i * (intervalSec > 0 ? intervalSec : 0);
          const metadata = {
            ...frame.metadata,
            frameIndex: i,
            captureOffsetSec,
            ...(i === 0 ? { intervalSec, firstFrameDelaySec } : {}),
          };

          const media = await this.mediaManager.persistMedia(
            frame.path,
            metadata,
            'image/jpeg',
          );
          await this.mediaManager.linkMediaToEvent(media.id, eventId, relation);
          linkedMediaIds.push(media.id);
        }

        if (linkedMediaIds.length > 0) {
          this.publishMediaReady(event, linkedMediaIds);
        }
      } catch (err) {
        console.error(
          '[EventMediaCoordinator] Failed to persist snapshot frames:',
          err,
        );
        await this.cleanupPendingFrames(resolvedPending).catch(() => {});
      }
    } else if (resolvedPending) {
      await this.cleanupPendingFrames(resolvedPending).catch(() => {});
    }

    // Schedule recording fetch (with delay)
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
    transforms:
      | { crop?: DeviceCameraConfig['crop']; rotate?: number }
      | undefined,
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
