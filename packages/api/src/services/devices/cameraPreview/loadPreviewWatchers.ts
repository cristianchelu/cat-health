import { isRecord } from 'shared';
import type { Kysely } from 'kysely';
import type { Database } from '../../../database/index.ts';
import type { DeviceCameraConfig } from '../../../database/types/DeviceCameraTable.ts';
import { isDeviceReachable } from '../deviceEnablement.ts';
import { isCamera, type DeviceDirectory } from '../types.ts';

export type PreviewWatcher = {
  deviceId: number;
  cameraId: number;
  crop?: DeviceCameraConfig['crop'];
  rotate?: number;
  config: DeviceCameraConfig | null;
};

/**
 * `config.hasCamera` / `state.hasCamera`. SQLite JSON true can round-trip as
 * `1`; both count. This is the only site that decides the flag.
 */
export function hasIntegratedCameraFlag(source: unknown): boolean {
  if (!isRecord(source)) return false;
  return source.hasCamera === true || source.hasCamera === 1;
}

/**
 * Reachable watching devices that have a camera: explicit `device_camera`
 * links, plus integrated cameras (`config.hasCamera` or live `state.hasCamera`)
 * with no link row. ESPHome fountains are the only integrated cameras today;
 * live state is probed only for that type so the poller does not instantiate
 * every device on the hub.
 */
export async function loadPreviewWatchers(
  db: Kysely<Database>,
  directory?: DeviceDirectory,
): Promise<PreviewWatcher[]> {
  const links = await db
    .selectFrom('device_camera')
    .innerJoin('device as watching', 'watching.id', 'device_camera.device_id')
    .innerJoin(
      'provider_account as watching_account',
      'watching_account.id',
      'watching.provider_account_id',
    )
    .innerJoin('device as camera', 'camera.id', 'device_camera.camera_id')
    .innerJoin(
      'provider_account as camera_account',
      'camera_account.id',
      'camera.provider_account_id',
    )
    .select([
      'device_camera.device_id',
      'device_camera.camera_id',
      'device_camera.config',
      'watching.enabled as watching_enabled',
      'watching_account.enabled as watching_account_enabled',
      'camera.enabled as camera_enabled',
      'camera_account.enabled as camera_account_enabled',
    ])
    .execute();

  const watchers: PreviewWatcher[] = [];
  const linkedDeviceIds = new Set<number>();

  for (const row of links) {
    if (
      !isDeviceReachable({
        enabled: row.watching_enabled,
        account_enabled: row.watching_account_enabled,
      })
    ) {
      continue;
    }
    if (
      !isDeviceReachable({
        enabled: row.camera_enabled,
        account_enabled: row.camera_account_enabled,
      })
    ) {
      continue;
    }

    linkedDeviceIds.add(row.device_id);
    const config = row.config;
    watchers.push({
      deviceId: row.device_id,
      cameraId: row.camera_id,
      crop: config?.crop,
      rotate: config?.rotate,
      config,
    });
  }

  const devices = await db
    .selectFrom('device')
    .innerJoin(
      'provider_account',
      'device.provider_account_id',
      'provider_account.id',
    )
    .selectAll('device')
    .select('provider_account.enabled as account_enabled')
    .execute();

  for (const device of devices) {
    if (linkedDeviceIds.has(device.id)) continue;
    if (!isDeviceReachable(device)) continue;

    if (hasIntegratedCameraFlag(device.config)) {
      watchers.push({
        deviceId: device.id,
        cameraId: device.id,
        config: null,
      });
      continue;
    }

    if (device.type !== 'water_fountain' || !directory) continue;
    const controller = await directory.instantiateController(device.id);
    if (!controller || !isCamera(controller)) continue;
    if (!hasIntegratedCameraFlag(controller.getState?.())) continue;
    watchers.push({
      deviceId: device.id,
      cameraId: device.id,
      config: null,
    });
  }

  return watchers;
}
