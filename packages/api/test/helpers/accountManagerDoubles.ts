import type { Device } from '../../src/database/types/DeviceTable.ts';
import type {
  AccountManager,
  DeviceController,
  DiscoveredDevice,
} from '../../src/services/devices/types.ts';

export function createStubDeviceController(
  device: Device,
  overrides: Partial<DeviceController> = {},
): DeviceController {
  return {
    deviceId: device.id,
    connect: async () => {},
    disconnect: async () => {},
    getStatus: () => 'online',
    getState: () => ({}),
    ...overrides,
  };
}

export function createStubAccountManager(
  overrides: Partial<AccountManager> & Pick<AccountManager, 'accountId'>,
): AccountManager {
  return {
    initialize: async () => {},
    shutdown: async () => {},
    discoverDevices: async () => [],
    instantiateDeviceController: () => {
      throw new Error('instantiateDeviceController not stubbed');
    },
    ...overrides,
  };
}

export function createDiscoverableAccountManager(
  devices: DiscoveredDevice[],
  accountId = 1,
): AccountManager {
  return createStubAccountManager({
    accountId,
    discoverDevices: async () => devices,
  });
}

export function createDeviceFriendlyAccountManager(
  accountId: number,
): AccountManager {
  return createStubAccountManager({
    accountId,
    instantiateDeviceController: (device) =>
      createStubDeviceController(device, {
        getState: () => ({ waterLevel: 0 }),
      }),
  });
}
