import { Insertable, Selectable, Updateable } from 'kysely';

export interface DeviceCameraConfig {
  crop?: { left: number; top: number; width: number; height: number };
  rotate?: number;
  /** Seconds to wait after event ends before fetching recording (e.g. for cameras with minimum clip duration). */
  fetchDelay?: number;
  /** Which media to acquire, e.g. ['snapshot', 'recording']. Defaults to ['snapshot']. */
  acquisitionTypes?: string[];
}

export interface DeviceCameraTable {
  device_id: number;
  camera_id: number;
  config: DeviceCameraConfig | null; // JSON
}

export type DeviceCamera = Selectable<DeviceCameraTable>;
export type NewDeviceCamera = Insertable<DeviceCameraTable>;
export type DeviceCameraUpdate = Updateable<DeviceCameraTable>;
