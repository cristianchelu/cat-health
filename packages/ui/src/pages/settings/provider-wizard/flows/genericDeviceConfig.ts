import type { DeviceConfigModule } from './deviceConfigTypes.ts';

/**
 * Fallback for providers whose device settings live elsewhere (ESPHome
 * entities, SurePet cloud) or have none beyond name / enabled / annotation.
 *
 * `toConfig` returns the existing row so a save of those shell fields cannot
 * wipe keys this module does not understand.
 */
export const genericDeviceConfig: DeviceConfigModule = {
  defaultConfigValues: {},
  toFormValues: () => ({}),
  toConfig: (_values, existing) => ({ ...existing }),
  Fields: () => null,
};
