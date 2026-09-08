import type { DeviceCameraConfig } from '../../../database/types/DeviceCameraTable.ts';

export const DEFAULT_PREVIEW_INTERVAL_SEC = 2;

/**
 * Idle poll interval for one watching device. Omitted `previewIntervalSec`
 * is 2s — that default lives only here. 0 (or negative) means do not poll;
 * live `/snapshot` and visit capture still `remember()`.
 */
export function previewPollIntervalMs(
  config?: DeviceCameraConfig | null,
): number | null {
  const raw = config?.previewIntervalSec;
  const intervalSec =
    typeof raw === 'number' && Number.isFinite(raw)
      ? raw
      : DEFAULT_PREVIEW_INTERVAL_SEC;
  if (intervalSec <= 0) return null;
  return intervalSec * 1000;
}

/**
 * Tightest poll among watchers of one camera. Each watcher keeps its own
 * `previewIntervalSec`; the camera is fetched once at min(those).
 */
export function coalesceCameraPollIntervals(
  watchers: readonly { cameraId: number; pollIntervalMs: number | null }[],
): Map<number, number> {
  const intervals = new Map<number, number>();
  for (const watcher of watchers) {
    if (watcher.pollIntervalMs == null) continue;
    const current = intervals.get(watcher.cameraId);
    if (current == null || watcher.pollIntervalMs < current) {
      intervals.set(watcher.cameraId, watcher.pollIntervalMs);
    }
  }
  return intervals;
}
