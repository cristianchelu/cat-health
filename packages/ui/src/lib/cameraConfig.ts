import type { DeviceCameraConfigDTO } from 'shared';
import { isRecord } from '@/lib/utils';

export interface CameraConfigDraft {
  /** Draft-selected camera device id, or null for no source. */
  cameraId: number | null;
  crop: Required<DeviceCameraConfigDTO>['crop'];
  rotate: number | undefined;
  acquisitionTypes: string[];
  fetchDelay: number;
  snapshotIntervalSec: number;
  snapshotFirstFrameDelaySec: number;
}

export type CameraSaveAction =
  | { type: 'none' }
  | { type: 'unlink' }
  | { type: 'link'; cameraId: number; config: DeviceCameraConfigDTO }
  | { type: 'updateConfig'; config: DeviceCameraConfigDTO };

export const CAMERA_ROTATION_OPTIONS = [0, 90, 180, 270] as const;
export type CameraRotationOption = (typeof CAMERA_ROTATION_OPTIONS)[number];

const DEFAULT_CROP: Required<DeviceCameraConfigDTO>['crop'] = {
  left: 0,
  top: 0,
  width: 1,
  height: 1,
};

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizeCrop(
  crop?: DeviceCameraConfigDTO['crop'],
): Required<DeviceCameraConfigDTO>['crop'] {
  if (!crop) return { ...DEFAULT_CROP };
  return {
    left: clamp01(crop.left ?? 0),
    top: clamp01(crop.top ?? 0),
    width: clamp01(crop.width ?? 1),
    height: clamp01(crop.height ?? 1),
  };
}

export function cameraConfigEqual(
  a: CameraConfigDraft,
  b: CameraConfigDraft,
): boolean {
  if (a.cameraId !== b.cameraId) return false;
  // Two unlinked drafts are equal no matter what the config fields say:
  // config-only edits while unlinked have nothing to save (see
  // resolveCameraSaveAction), so counting them as dirty would enable a
  // Save button that does nothing.
  if (a.cameraId === null) return true;
  const aTypes = [...a.acquisitionTypes].sort();
  const bTypes = [...b.acquisitionTypes].sort();
  return (
    (a.rotate ?? 0) === (b.rotate ?? 0) &&
    a.fetchDelay === b.fetchDelay &&
    a.snapshotIntervalSec === b.snapshotIntervalSec &&
    a.snapshotFirstFrameDelaySec === b.snapshotFirstFrameDelaySec &&
    a.crop.left === b.crop.left &&
    a.crop.top === b.crop.top &&
    a.crop.width === b.crop.width &&
    a.crop.height === b.crop.height &&
    aTypes.length === bTypes.length &&
    aTypes.every((type, index) => type === bTypes[index])
  );
}

export function buildCameraConfig(
  draft: CameraConfigDraft,
): DeviceCameraConfigDTO {
  const acquisitionTypes = draft.acquisitionTypes.length
    ? draft.acquisitionTypes
    : ['snapshot'];
  return {
    crop: draft.crop,
    rotate: draft.rotate,
    acquisitionTypes,
    fetchDelay: draft.fetchDelay,
    snapshot: acquisitionTypes.includes('snapshot')
      ? {
          intervalSec: draft.snapshotIntervalSec,
          firstFrameDelaySec: draft.snapshotFirstFrameDelaySec,
        }
      : undefined,
  };
}

export function toggleAcquisitionType(
  types: readonly string[],
  type: string,
): string[] {
  return types.includes(type)
    ? types.filter((current) => current !== type)
    : [...types, type].sort();
}

export function draftFromCameraConfig(
  config: DeviceCameraConfigDTO | undefined,
): CameraConfigDraft {
  return {
    cameraId: null,
    crop: normalizeCrop(config?.crop),
    rotate: config?.rotate,
    acquisitionTypes: config?.acquisitionTypes?.length
      ? [...config.acquisitionTypes]
      : ['snapshot'],
    fetchDelay: config?.fetchDelay ?? 60,
    snapshotIntervalSec: config?.snapshot?.intervalSec ?? 0,
    snapshotFirstFrameDelaySec: config?.snapshot?.firstFrameDelaySec ?? 0,
  };
}

export function draftFromCameraLink(
  link:
    | { camera_id: number; config?: DeviceCameraConfigDTO | null }
    | null
    | undefined,
): CameraConfigDraft {
  if (!link) return draftFromCameraConfig(undefined);
  return {
    ...draftFromCameraConfig(link.config ?? undefined),
    cameraId: link.camera_id,
  };
}

/**
 * Decides which camera mutation Save should run. Config-only edits while
 * unlinked are a no-op — there is no link row to patch.
 */
export function resolveCameraSaveAction(
  baseline: CameraConfigDraft,
  draft: CameraConfigDraft,
): CameraSaveAction {
  if (cameraConfigEqual(baseline, draft)) return { type: 'none' };

  if (draft.cameraId === null) {
    return baseline.cameraId === null ? { type: 'none' } : { type: 'unlink' };
  }

  if (draft.cameraId !== baseline.cameraId) {
    return {
      type: 'link',
      cameraId: draft.cameraId,
      config: buildCameraConfig(draft),
    };
  }

  return { type: 'updateConfig', config: buildCameraConfig(draft) };
}

export function hasLinkableCameras(args: {
  cameras: readonly unknown[];
  hasIntegratedCamera: boolean;
}): boolean {
  return args.hasIntegratedCamera || args.cameras.length > 0;
}

/**
 * Prefer live state; fall back to the durable config flag written on first
 * ESPHome camera-entity discovery so offline devices keep the picker option.
 */
export function deviceHasIntegratedCamera(device: {
  state?: unknown;
  config?: unknown;
}): boolean {
  if (isRecord(device.state) && device.state.hasCamera === true) return true;
  return isRecord(device.config) && device.config.hasCamera === true;
}
