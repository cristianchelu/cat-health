import type { Kysely } from 'kysely';
import { isRecord } from 'shared';
import { MediaManager } from '../media/MediaManager.ts';
import type { Database } from '../../database/index.ts';
import type { Device } from '../../database/types/DeviceTable.ts';
import type { EventBus } from './EventBus.ts';
import type {
  AccountManager,
  Camera,
  DeviceController,
  DeviceDirectory,
  DeviceIntegrationContext,
  DeviceProvider,
  ProviderDeps,
  ProviderListing,
} from './types.ts';
import { isCamera } from './types.ts';
import { DevicePresence } from './DevicePresence.ts';
import { recordDeviceEvent } from '../events/recordDeviceEvent.ts';

export class IntegrationManager
  implements DeviceDirectory, DeviceIntegrationContext
{
  private providers = new Map<string, DeviceProvider>();
  private accountManagers = new Map<number, AccountManager>();
  private deps: ProviderDeps;
  private mediaManager: MediaManager;
  private readonly presence: DevicePresence;

  constructor(db: Kysely<Database>, eventBus: EventBus) {
    this.mediaManager = new MediaManager(db);
    this.presence = new DevicePresence({
      db,
      eventBus,
      recordDeviceEvent: (input) => recordDeviceEvent({ db, eventBus }, input),
    });
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

  getProviders(): ProviderListing[] {
    return Array.from(this.providers.values()).map((p) => ({
      name: p.name,
      internal: p.internal ?? false,
      capabilities: p.capabilities,
    }));
  }

  validateAccountConfig(providerName: string, config: unknown): boolean {
    const provider = this.providers.get(providerName);
    if (!provider) return false;
    return provider.validateAccountConfig(config);
  }

  reconcileRuntimeState(
    providerName: string,
    args: {
      previousConfig: unknown;
      nextConfig: unknown;
      runtimeState: unknown;
    },
  ): Record<string, unknown> {
    const provider = this.providers.get(providerName);
    // isRecord rejects arrays, so a `[]` runtime_state cannot be echoed back
    // and re-persisted as '[]'.
    const current = isRecord(args.runtimeState) ? args.runtimeState : {};
    if (!provider?.reconcileRuntimeState) return current;
    return provider.reconcileRuntimeState(args);
  }

  async validateAccountConfigChange(
    accountId: number,
    providerName: string,
    args: { previousConfig: unknown; nextConfig: unknown },
  ): Promise<string | null> {
    const provider = this.providers.get(providerName);
    // Only count devices when a provider actually cares — this runs on every
    // account config PATCH.
    if (!provider?.validateAccountConfigChange) return null;

    const row = await this.deps.db
      .selectFrom('device')
      .select((eb) => eb.fn.countAll().as('device_count'))
      .where('provider_account_id', '=', accountId)
      .executeTakeFirst();

    return provider.validateAccountConfigChange({
      ...args,
      registeredDeviceCount: Number(row?.device_count ?? 0),
    });
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

  /** Inject a pre-built account manager without provider initialization (test seam). */
  registerAccountManager(accountId: number, manager: AccountManager): void {
    this.accountManagers.set(accountId, manager);
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
      if (controller && isCamera(controller)) {
        const camera = controller;
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
    if (requestingController && isCamera(requestingController)) {
      const integratedCamera = requestingController;
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
