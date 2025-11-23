import { Bonjour } from 'bonjour-service';
import type {
  AccountManager,
  DeviceController,
  DiscoveredDevice,
  ProviderDeps,
  Device,
  ProviderAccount,
} from '../../types.ts';
import { FountainController } from './FountainController.ts';

export class ESPHomeAccountManager implements AccountManager {
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
    return new Promise((resolve) => {
      const bonjour = new Bonjour();
      const devices: DiscoveredDevice[] = [];

      const browser = bonjour.find({ type: 'esphomelib' });

      browser.on('up', (service) => {
        // Prefer IPv4, fallback to IPv6, then hostname
        const host =
          service.addresses?.find((addr: string) => addr.includes('.')) ||
          service.addresses?.[0] ||
          service.host;

        if (!host) return;

        // Check if we already found this device
        if (devices.some((d) => d.externalId === service.host)) return;

        devices.push({
          externalId: service.host,
          name: service.name,
          type: 'water_fountain', // Defaulting to water_fountain as it's the only supported type for now
          config: {
            host,
            port: service.port,
          },
        });
      });

      // Wait for 3 seconds to collect devices
      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        resolve(devices);
      }, 3000);
    });
  }

  getDeviceController(device: Device): DeviceController {
    const existing = this.controllers.get(device.id);
    if (existing) {
      return existing;
    }

    let controller: DeviceController;
    if (device.type === 'water_fountain') {
      controller = new FountainController(device, this.deps);
    } else {
      throw new Error(
        `Unsupported device type for ESPHome provider: ${device.type}`,
      );
    }
    this.controllers.set(device.id, controller);
    return controller;
  }
}
