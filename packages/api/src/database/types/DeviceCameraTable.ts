import { Insertable, Selectable, Updateable } from 'kysely';

export interface DeviceCameraConfig {
  crop?: { left: number; top: number; width: number; height: number };
  rotate?: number;
}

export interface DeviceCameraTable {
  device_id: number;
  camera_id: number;
  config: DeviceCameraConfig | null; // JSON
}

export type DeviceCamera = Selectable<DeviceCameraTable>;
export type NewDeviceCamera = Insertable<DeviceCameraTable>;
export type DeviceCameraUpdate = Updateable<DeviceCameraTable>;
