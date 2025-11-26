import { Bonjour } from 'bonjour-service';
import { EspHomeClient } from 'esphome-client';
import type { DeviceType } from 'shared';
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

  private inferDeviceType(name: string): DiscoveredDevice['type'] | null {
    const matchers: Array<{
      type: DiscoveredDevice['type'];
      check: (name: string) => boolean;
    }> = [
      {
        type: 'water_fountain',
        check: (name) => name.toLowerCase().includes('petlibro.plwf105'),
      },
    ];

    const match = matchers.find((m) => m.check(name));
    return match?.type ?? null;
  }

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    return new Promise((resolve) => {
      const bonjour = new Bonjour();
      const devices: DiscoveredDevice[] = [];

      const browser = bonjour.find({ type: 'esphomelib' }, (service) => {
        // Prefer IPv4, fallback to IPv6, then hostname
        const host =
          service.addresses?.find((addr: string) => addr.includes('.')) ||
          service.addresses?.[0] ||
          service.host;

        if (!host) return;

        // Check if we already found this device
        if (devices.some((d) => d.externalId === service.host)) return;

        const txt = service.txt || {};
        const projectName = txt.project_name || '';
        const version = txt.version || '';
        const mac = txt.mac || '';

        const type = this.inferDeviceType(projectName);
        if (!type) return;

        devices.push({
          externalId: service.host,
          name: service.name,
          type,
          config: {
            host,
            port: service.port,
            mac,
            version,
            projectName,
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

  instantiateDeviceController(device: Device): DeviceController {
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

    // Start connection
    controller.connect().catch((err) => {
      console.error(`Failed to connect to device ${device.id}:`, err);
    });

    this.controllers.set(device.id, controller);
    return controller;
  }

  async validateDeviceConfig(device: {
    type: DeviceType;
    config: unknown;
  }): Promise<void> {
    const config = device.config as {
      host: string;
      port?: number;
      encryptionKey?: string;
    };

    if (!config.host) {
      throw new Error('Device host is required');
    }

    const client = new EspHomeClient({
      host: config.host,
      port: config.port ?? 6053,
      psk: config.encryptionKey,
      clientId: 'CatHealth Validator',
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timed out'));
        }, 5000);

        client.on('connect', () => {
          clearTimeout(timeout);
          resolve();
        });

        try {
          client.connect();
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    } finally {
      client.disconnect();
    }
  }
}
