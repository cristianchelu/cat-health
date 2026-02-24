import Compile from 'typebox/compile';
import type {
  AccountManager,
  DeviceController,
  DiscoveredDevice,
  Device,
  ProviderAccount,
  ProviderDeps,
} from '../../types.ts';
import {
  ThinginoConfigSchema,
  ThinginoDeviceController,
} from './ThinginoDeviceController.ts';

export class ThinginoAccountManager implements AccountManager {
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

  async invalidateDeviceController(deviceId: number): Promise<void> {
    const controller = this.controllers.get(deviceId);
    if (controller) {
      await controller.disconnect();
      this.controllers.delete(deviceId);
    }
  }

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    return [];
  }

  async validateDeviceConfig(device: {
    type: string;
    config: unknown;
  }): Promise<void> {
    if (device.type !== 'camera') {
      throw new Error(`Unsupported device type: ${device.type}`);
    }

    const validator = Compile(ThinginoConfigSchema);
    if (!validator.Check(device.config)) {
      const errors = [...validator.Errors(device.config)];
      throw new Error(
        `Invalid Thingino configuration: ${JSON.stringify(errors)}`,
      );
    }
  }

  instantiateDeviceController(device: Device): DeviceController {
    const existing = this.controllers.get(device.id);
    if (existing) {
      return existing;
    }

    if (device.type === 'camera') {
      const controller = new ThinginoDeviceController(device, this.deps);
      this.controllers.set(device.id, controller);
      return controller;
    }

    throw new Error(
      `Unsupported device type for Thingino provider: ${device.type}`,
    );
  }
}
