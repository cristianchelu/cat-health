export const CAMERA_ROTATION_OPTIONS = [0, -90, 180, 90] as const;
export type CameraRotationOption = (typeof CAMERA_ROTATION_OPTIONS)[number];

export type CameraGravityUpEdge = 'top' | 'right' | 'bottom' | 'left';

/**
 * Snap any stored angle onto the Camera tab stops: 0, -90, 180, 90.
 * Those are which way is up on the snapshot, CCW-positive — 270 is -90.
 */
export function normalizeCameraRotation(
  degrees: number | undefined,
): CameraRotationOption {
  if (degrees == null || !Number.isFinite(degrees)) return 0;
  const turned = ((Math.round(degrees) % 360) + 360) % 360;
  let best: CameraRotationOption = 0;
  let bestDist = 360;
  for (const option of CAMERA_ROTATION_OPTIONS) {
    const stop = ((option % 360) + 360) % 360;
    const dist = Math.min(
      Math.abs(stop - turned),
      360 - Math.abs(stop - turned),
    );
    if (dist < bestDist) {
      best = option;
      bestDist = dist;
    }
  }
  return best;
}

/** Snapshot edge that `normalizeCameraRotation` treats as up. */
export function gravityUpEdge(rotate: number | undefined): CameraGravityUpEdge {
  switch (normalizeCameraRotation(rotate)) {
    case -90:
      return 'right';
    case 180:
      return 'bottom';
    case 90:
      return 'left';
    default:
      return 'top';
  }
}
