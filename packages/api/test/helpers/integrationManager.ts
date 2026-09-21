import type { Kysely } from 'kysely';

import type { Database } from '../../src/database/index.ts';
import { EventBus } from '../../src/services/devices/EventBus.ts';
import { IntegrationManager } from '../../src/services/devices/IntegrationManager.ts';
import type { ProviderAccount } from '../../src/database/types/ProviderAccountTable.ts';
import type {
  AccountManager,
  DeviceProvider,
} from '../../src/services/devices/types.ts';
import { CameraProvider } from '../../src/services/devices/providers/camera/CameraProvider.ts';
import { ESPHomeProvider } from '../../src/services/devices/providers/esphome/ESPHomeProvider.ts';
import { InferenceProvider } from '../../src/services/devices/providers/inference/InferenceProvider.ts';
import { MqttProvider } from '../../src/services/devices/providers/mqtt/MqttProvider.ts';
import { SurePetProvider } from '../../src/services/devices/providers/surepet/SurePetProvider.ts';
import { ThinginoProvider } from '../../src/services/devices/providers/thingino/ThinginoProvider.ts';

export interface TestIntegrationManagerOptions {
  accountManagers?: ReadonlyMap<number, AccountManager>;
  /** Pass one to observe what account managers publish. */
  eventBus?: EventBus;
  /**
   * Providers to replace with one whose account manager is the given stub.
   * Anything that rebuilds an account manager at runtime — switching an
   * account back on, for one — would otherwise get the real provider, and a
   * real ESPHome manager keeps dialling the fixture host until the process
   * is killed.
   */
  inertProviders?: ReadonlyMap<
    string,
    (account: ProviderAccount) => AccountManager
  >;
}

function inertProvider(
  name: string,
  createAccountManager: (account: ProviderAccount) => AccountManager,
): DeviceProvider {
  return {
    name,
    capabilities: {
      supports_discovery: false,
      allows_direct_registration: true,
      supported_device_types: ['litterbox', 'water_fountain', 'feeder'],
    },
    createAccountManager,
    validateAccountConfig: () => true,
  };
}

export function createTestIntegrationManager(
  db: Kysely<Database>,
  options: TestIntegrationManagerOptions = {},
): IntegrationManager {
  const eventBus = options.eventBus ?? new EventBus();
  const integrationManager = new IntegrationManager(db, eventBus);

  integrationManager.registerProvider(new ESPHomeProvider());
  integrationManager.registerProvider(new CameraProvider());
  integrationManager.registerProvider(new ThinginoProvider());
  integrationManager.registerProvider(new InferenceProvider());
  integrationManager.registerProvider(new SurePetProvider());
  integrationManager.registerProvider(new MqttProvider());

  for (const [name, factory] of options.inertProviders ?? []) {
    integrationManager.registerProvider(inertProvider(name, factory));
  }

  for (const [accountId, manager] of options.accountManagers ?? []) {
    integrationManager.registerAccountManager(accountId, manager);
  }

  return integrationManager;
}
