import type { DeviceConfigModule } from './deviceConfigTypes.ts';
import { genericDeviceConfig } from './genericDeviceConfig.ts';
import { CameraDeviceFields } from './camera/CameraDeviceFields.tsx';
import {
  cameraDefaultConfigValues,
  cameraToConfig,
  cameraToFormValues,
} from './camera/cameraDeviceConfig.ts';
import { ThinginoDeviceFields } from './thingino/ThinginoDeviceFields.tsx';
import {
  thinginoDefaultConfigValues,
  thinginoToConfig,
  thinginoToFormValues,
} from './thingino/thinginoDeviceConfig.ts';

/**
 * Per-provider device settings, keyed by provider name — the same shape as
 * `accountConfigRegistry.ts` for account connect/edit.
 *
 * Generic surfaces call `getDeviceConfigModule()` and never name a provider,
 * which is what AGENTS.md requires of anything outside `flows/<provider>/`.
 */
const cameraDeviceConfig: DeviceConfigModule = {
  defaultConfigValues: cameraDefaultConfigValues,
  toFormValues: cameraToFormValues,
  toConfig: cameraToConfig,
  Fields: CameraDeviceFields,
};

const thinginoDeviceConfig: DeviceConfigModule = {
  defaultConfigValues: thinginoDefaultConfigValues,
  toFormValues: thinginoToFormValues,
  toConfig: thinginoToConfig,
  Fields: ThinginoDeviceFields,
};

const DEVICE_CONFIG_MODULES: Record<string, DeviceConfigModule> = {
  camera: cameraDeviceConfig,
  thingino: thinginoDeviceConfig,
};

/** Always returns a usable module; unknown providers get the generic fallback. */
export function getDeviceConfigModule(provider: string): DeviceConfigModule {
  return DEVICE_CONFIG_MODULES[provider] ?? genericDeviceConfig;
}
