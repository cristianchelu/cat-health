import type {
  AccountManager,
  DeviceController,
  DiscoveredDevice,
  ProviderDeps,
  Device,
  ProviderAccount,
} from '../../types.ts';
import { CameraDeviceController } from './CameraDeviceController.ts';

export class CameraAccountManager implements AccountManager {
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
    // Nothing to do for now
  }

  async shutdown(): Promise<void> {
    for (const controller of this.controllers.values()) {
      await controller.disconnect();
    }
    this.controllers.clear();
  }

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    return [];
  }

  instantiateDeviceController(device: Device): DeviceController {
    const existing = this.controllers.get(device.id);
    if (existing) {
      return existing;
    }

    let controller: DeviceController;
    if (device.type === 'camera') {
      controller = new CameraDeviceController(device, this.deps);
    } else {
      throw new Error(
        `Unsupported device type for Camera provider: ${device.type}`,
      );
    }
    this.controllers.set(device.id, controller);
    return controller;
  }
}
