import { Insertable, Selectable, Updateable } from 'kysely';

export interface DeviceRecognitionConfig {
  /** `null` means "whatever the app ships as its default" — not "no model". */
  model: string | null;
  prompt_template: string;
  auto_identify: boolean;
  reference_images: Record<string, number[]>;
  /** Pets this camera never sees, by id. Absent means nobody is excluded. */
  ignored_pets?: number[];
}

/**
 * Recognition attached to the device that is *observed*, mirroring
 * `device_camera`: one row per watched device, so the scene config lives with
 * the scene rather than inside a separate recognizer device that could only
 * ever serve one camera.
 */
export interface DeviceRecognitionTable {
  device_id: number;
  account_id: number;
  config: DeviceRecognitionConfig; // JSON
}

export type DeviceRecognition = Selectable<DeviceRecognitionTable>;
export type NewDeviceRecognition = Insertable<DeviceRecognitionTable>;
export type DeviceRecognitionUpdate = Updateable<DeviceRecognitionTable>;
