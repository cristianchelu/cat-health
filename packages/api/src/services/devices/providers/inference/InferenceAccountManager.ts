import type {
  AccountManager,
  DeviceController,
  DiscoveredDevice,
  ProviderDeps,
  Device,
  ProviderAccount,
} from '../../types.ts';
import { PetRecognizerController } from './PetRecognizerController.ts';

export class InferenceAccountManager implements AccountManager {
  readonly accountId: number;
  private controllers = new Map<number, DeviceController>();
  private account: ProviderAccount;
  private deps: ProviderDeps;

  constructor(account: ProviderAccount, deps: ProviderDeps) {
    this.account = account;
    this.deps = deps;
    this.accountId = account.id;
  }

  async initialize(): Promise<void> {
    // Load all pet_recognizer devices for this account
    const devices = await this.deps.db
      .selectFrom('device')
      .selectAll()
      .where('provider_account_id', '=', this.accountId)
      .where('type', '=', 'pet_recognizer')
      .where('enabled', '=', 1)
      .execute();

    // Instantiate and connect all recognizers
    for (const device of devices) {
      try {
        const controller = this.instantiateDeviceController(device);
        await controller.connect();
        console.log(`Initialized pet recognizer: ${device.name}`);
      } catch (error) {
        console.error(
          `Failed to initialize recognizer ${device.name}:`,
          error,
        );
      }
    }
  }

  async shutdown(): Promise<void> {
    for (const controller of this.controllers.values()) {
      await controller.disconnect();
    }
    this.controllers.clear();
  }

  async invalidateDeviceController(deviceId: number): Promise<void> {
    const controller = this.controllers.get(deviceId);
    if (controller) {
      await controller.disconnect();
      this.controllers.delete(deviceId);
    }
  }

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    // No auto-discovery for inference devices - manual setup only
    return [];
  }

  instantiateDeviceController(device: Device): DeviceController {
    const existing = this.controllers.get(device.id);
    if (existing) {
      return existing;
    }

    let controller: DeviceController;
    if (device.type === 'pet_recognizer') {
      controller = new PetRecognizerController(device, this.account, this.deps);
    } else {
      throw new Error(
        `Unsupported device type for Inference provider: ${device.type}`,
      );
    }
    this.controllers.set(device.id, controller);
    return controller;
  }
}
