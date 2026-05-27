import type { Kysely } from 'kysely';
import type { ProviderCapabilities } from 'shared';
import { MediaManager } from '../media/MediaManager.ts';
import type { Database } from '../../database/index.ts';
import type { Device } from '../../database/types/DeviceTable.ts';
import type { EventBus } from './EventBus.ts';
import type {
  AccountManager,
  Camera,
  DeviceController,
  DeviceDirectory,
  DeviceProvider,
  ProviderDeps,
} from './types.ts';
import { DevicePresence } from './DevicePresence.ts';

export class IntegrationManager implements DeviceDirectory {
  private providers = new Map<string, DeviceProvider>();
  private accountManagers = new Map<number, AccountManager>();
  private deps: ProviderDeps;
  private mediaManager: MediaManager;
  private readonly presence: DevicePresence;

  constructor(db: Kysely<Database>, eventBus: EventBus) {
    this.mediaManager = new MediaManager(db);
    this.presence = new DevicePresence(db);
    this.deps = {
      db,
      eventBus,
      logger: console,
      mediaManager: this.mediaManager,
      directory: this,
      presence: this.presence,
    };
  }

  getPresence(): DevicePresence {
    return this.presence;
  }

  getMediaManager(): MediaManager {
    return this.mediaManager;
  }

  registerProvider(provider: DeviceProvider) {
    this.providers.set(provider.name, provider);
  }

  getProviders(): {
    name: string;
    internal: boolean;
    capabilities: ProviderCapabilities;
  }[] {
    return Array.from(this.providers.values()).map((p) => ({
      name: p.name,
      internal: p.internal ?? false,
      capabilities: p.capabilities,
    }));
  }

  async initialize() {
    await this.mediaManager.initialize();
    await this.presence.hydrateAll();

    // Load all provider accounts
    const accounts = await this.deps.db
      .selectFrom('provider_account')
      .selectAll()
      .where('enabled', '=', 1) // Assuming 1 is true in SQLite/Kysely mapping
      .execute();

    for (const account of accounts) {
      const provider = this.providers.get(account.provider);
      if (!provider) {
        console.warn(
          `Provider ${account.provider} not found for account ${account.id}`,
        );
        continue;
      }

      try {
        const manager = provider.createAccountManager(account, this.deps);
        this.accountManagers.set(account.id, manager);
        await manager.initialize();
        console.log(
          `Initialized account ${account.name} (${account.provider})`,
        );
      } catch (err) {
        console.error(`Failed to initialize account ${account.id}:`, err);
      }
    }
  }

  async initializeAccount(accountId: number) {
    const account = await this.deps.db
      .selectFrom('provider_account')
      .selectAll()
      .where('id', '=', accountId)
      .executeTakeFirst();

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const provider = this.providers.get(account.provider);
    if (!provider) {
      throw new Error(`Provider ${account.provider} not found`);
    }

    // Shutdown existing manager if any
    const existingManager = this.accountManagers.get(accountId);
    if (existingManager) {
      await existingManager.shutdown();
    }

    const manager = provider.createAccountManager(account, this.deps);
    this.accountManagers.set(account.id, manager);
    await manager.initialize();
    console.log(`Initialized account ${account.name} (${account.provider})`);
  }

  getAccountManager(accountId: number): AccountManager | undefined {
    return this.accountManagers.get(accountId);
  }

  /** Teardown cached controller for a device so next use gets fresh config (e.g. after PATCH device). */
  async invalidateDeviceController(deviceId: number): Promise<void> {
    const device = await this.deps.db
      .selectFrom('device')
      .select(['provider_account_id'])
      .where('id', '=', deviceId)
      .executeTakeFirst();
    if (!device) return;
    const manager = this.accountManagers.get(device.provider_account_id);
    if (manager?.invalidateDeviceController) {
      await manager.invalidateDeviceController(deviceId);
    }
  }

  instantiateDeviceController(device: Device): DeviceController | undefined {
    const manager = this.accountManagers.get(device.provider_account_id);
    if (!manager) {
      return undefined;
    }
    return manager.instantiateDeviceController(device);
  }

  async instantiateController(
    deviceId: number,
  ): Promise<DeviceController | undefined> {
    const device = await this.deps.db
      .selectFrom('device')
      .selectAll()
      .where('id', '=', deviceId)
      .executeTakeFirst();

    if (!device) return undefined;
    return this.instantiateDeviceController(device);
  }

  async getLinkedCamera(deviceId: number): Promise<Camera | undefined> {
    // Check for external linked camera first
    const link = await this.deps.db
      .selectFrom('device_camera')
      .where('device_id', '=', deviceId)
      .select(['camera_id', 'config'])
      .executeTakeFirst();

    if (link) {
      // Use external linked camera
      const controller = await this.instantiateController(link.camera_id);
      if (controller && 'captureSnapshot' in controller) {
        const camera = controller as unknown as Camera;
        const config = link.config || {};

        // Return a proxy that injects the config
        return {
          ...camera,
          deviceId: camera.deviceId,
          connect: camera.connect.bind(camera),
          disconnect: camera.disconnect.bind(camera),
          getStatus: camera.getStatus.bind(camera),
          captureSnapshot: async (options) => {
            return camera.captureSnapshot({
              ...options,
              crop: config.crop,
              rotate: config.rotate,
            });
          },
        };
      }
      return undefined;
    }

    // Fall back to integrated camera if no external link
    const requestingController = await this.instantiateController(deviceId);
    if (
      requestingController &&
      'captureSnapshot' in requestingController &&
      'getSnapshotBuffer' in requestingController
    ) {
      const integratedCamera = requestingController as unknown as Camera;
      // Check if integrated camera is available and enabled
      const state = requestingController.getState?.();
      if (state && 'hasCamera' in state && state.hasCamera) {
        return integratedCamera;
      }
    }

    return undefined;
  }

  async shutdown() {
    for (const manager of this.accountManagers.values()) {
      try {
        await manager.shutdown();
      } catch (err) {
        console.error(`Error shutting down manager ${manager.accountId}:`, err);
      }
    }
  }
}
