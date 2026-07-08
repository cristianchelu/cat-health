import type {
  AccountManager,
  DiscoveredDevice,
} from '../../src/services/devices/types.ts';

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
