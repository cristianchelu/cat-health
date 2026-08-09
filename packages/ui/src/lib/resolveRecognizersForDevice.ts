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
 * Every pet_recognizer device, regardless of which source it points at.
 * Used by the Change picker so the user can switch which recognizer serves
 * this device.
 */
export function listPetRecognizers<T extends RecognizerDeviceRef>(
  devices: readonly T[],
): T[] {
  return devices.filter((device) => device.type === 'pet_recognizer');
}
