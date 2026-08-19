import { isDeviceActive, type DeviceEnablement } from '@/lib/deviceMonitoring';
import { getNumberValue, isRecord } from '@/lib/utils';

export interface RecognizerDeviceRef {
  id: number;
  type: string;
  config?: unknown;
}

/**
 * Recognizers currently pointed at `sourceDeviceId`. At most one should match
 * in product use — a device has a single active recognizer.
 */
export function resolveRecognizersForDevice<T extends RecognizerDeviceRef>(
  sourceDeviceId: number,
  devices: readonly T[],
): T[] {
  return devices.filter((device) => {
    if (device.type !== 'pet_recognizer') return false;
    if (!isRecord(device.config)) return false;
    const linkedSourceId = getNumberValue(device.config, 'source_device_id');
    return linkedSourceId === sourceDeviceId;
  });
}

/**
 * Every usable pet_recognizer, for the Change picker. An offer list, so
 * switched-off recognizers are dropped; `resolveRecognizersForDevice` above
 * answers what is linked right now and keeps returning a disabled one so the
 * tab can still show and unlink it.
 */
export function listPetRecognizers<
  T extends RecognizerDeviceRef & DeviceEnablement,
>(devices: readonly T[]): T[] {
  return devices.filter(
    (device) => device.type === 'pet_recognizer' && isDeviceActive(device),
  );
}
