import {
  coalesceCameraPollIntervals,
  previewPollIntervalMs,
} from './previewConfig.ts';
import type { PreviewWatcher } from './loadPreviewWatchers.ts';

const FETCH_CONCURRENCY = 2;

export type CameraIdlePollerDeps = {
  loadWatchers: () => Promise<PreviewWatcher[]>;
  fetchSnapshot: (cameraId: number) => Promise<Buffer | undefined>;
  remember: (cameraId: number, jpeg: Buffer) => void;
};

/**
 * Fetches each camera at the tightest poll interval of its watchers.
 * Atlas composition does not live here.
 */
export class CameraIdlePoller {
  private readonly deps: CameraIdlePollerDeps;
  private readonly inFlight = new Set<number>();
  private readonly lastFetchAt = new Map<number, number>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private tickInFlight: Promise<void> | undefined;

  constructor(deps: CameraIdlePollerDeps) {
    this.deps = deps;
  }

  start(intervalMs = 250): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(now = Date.now()): Promise<void> {
    if (this.tickInFlight) {
      await this.tickInFlight;
      return;
    }

    const work = this.runTick(now);
    this.tickInFlight = work;
    try {
      await work;
    } finally {
      if (this.tickInFlight === work) {
        this.tickInFlight = undefined;
      }
    }
  }

  private async runTick(now: number): Promise<void> {
    let watchers: PreviewWatcher[];
    try {
      watchers = await this.deps.loadWatchers();
    } catch (error) {
      console.error('[CameraIdlePoller] failed to load watchers:', error);
      return;
    }

    const intervals = coalesceCameraPollIntervals(
      watchers.map((watcher) => ({
        cameraId: watcher.cameraId,
        pollIntervalMs: previewPollIntervalMs(watcher.config),
      })),
    );

    const due: number[] = [];
    for (const [cameraId, intervalMs] of intervals) {
      if (this.inFlight.has(cameraId)) continue;
      const last = this.lastFetchAt.get(cameraId);
      if (last == null || now - last >= intervalMs) due.push(cameraId);
    }

    await mapPool(due, FETCH_CONCURRENCY, (cameraId) =>
      this.fetchOne(cameraId, now),
    );
  }

  private async fetchOne(cameraId: number, now: number): Promise<void> {
    this.inFlight.add(cameraId);
    try {
      const jpeg = await this.deps.fetchSnapshot(cameraId);
      if (jpeg) this.deps.remember(cameraId, jpeg);
    } catch (error) {
      console.error(
        `[CameraIdlePoller] snapshot failed for camera ${cameraId}:`,
        error,
      );
    } finally {
      this.lastFetchAt.set(cameraId, now);
      this.inFlight.delete(cameraId);
    }
  }
}

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) return;
        await worker(item);
      }
    },
  );
  await Promise.all(workers);
}
