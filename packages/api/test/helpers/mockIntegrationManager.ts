import type { IntegrationManager } from '../../src/services/devices/IntegrationManager.ts';
import type {
  AccountManager,
  DeviceDirectory,
  DiscoveredDevice,
} from '../../src/services/devices/types.ts';
import { ESPHomeProvider } from '../../src/services/devices/providers/esphome/ESPHomeProvider.ts';
import { InferenceProvider } from '../../src/services/devices/providers/inference/InferenceProvider.ts';
import { SurePetProvider } from '../../src/services/devices/providers/surepet/SurePetProvider.ts';

export interface MockIntegrationManagerOptions {
  accountManagers?: Map<number, AccountManager>;
}

export function createMockIntegrationManager(
  options: MockIntegrationManagerOptions = {},
): IntegrationManager {
  const providers = [
    new ESPHomeProvider(),
    new SurePetProvider(),
    new InferenceProvider(),
  ];
  const accountManagers = options.accountManagers ?? new Map<number, AccountManager>();

  const stub = {
    getProviders: () =>
      providers.map((provider) => ({
        name: provider.name,
        internal: provider.internal ?? false,
        capabilities: provider.capabilities,
      })),
    getAccountManager: (accountId: number) => accountManagers.get(accountId),
    getPresence: () => ({
      getSnapshot: async () => ({
        status: 'unknown' as const,
        lastSeenMs: null,
      }),
    }),
    instantiateDeviceController: () => undefined,
    invalidateDeviceController: async () => {},
    instantiateController: async () => undefined,
    getLinkedCamera: async () => undefined,
    getMediaManager: () => {
      throw new Error('getMediaManager not available in mock IntegrationManager');
    },
    initialize: async () => {},
    initializeAccount: async () => {},
    registerProvider: () => {},
    shutdown: async () => {},
  };

  return stub as unknown as IntegrationManager;
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

export type { DeviceDirectory };
