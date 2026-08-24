import { Bonjour } from 'bonjour-service';
import { requireWithSchema } from 'shared';
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
import {
  ThinginoHttpClient,
  originFromBonjour,
  confirmThinginoCandidates,
} from './ThinginoHttpClient.ts';

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
    const devices = await this.deps.db
      .selectFrom('device')
      .selectAll()
      .where('provider_account_id', '=', this.accountId)
      .where('enabled', '=', 1)
      .execute();

    for (const device of devices) {
      try {
        this.instantiateDeviceController(device);
      } catch (err) {
        console.error(
          `Failed to instantiate controller for device ${device.id}:`,
          err,
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
    return new Promise((resolve) => {
      const bonjour = new Bonjour();
      const pending = new Map<string, DiscoveredDevice>();

      const browser = bonjour.find({ type: 'http' }, (service) => {
        const origin = originFromBonjour(service);
        if (!origin) return;

        const externalId = (service.host ?? '').replace(/\.$/, '') || origin;
        if (pending.has(externalId)) return;

        pending.set(externalId, {
          externalId,
          name: service.name || externalId,
          type: 'camera',
          config: { origin },
        });
      });

      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        void confirmThinginoCandidates([...pending.values()]).then(resolve);
      }, 3000);
    });
  }

  async validateDeviceConfig(device: {
    type: string;
    config: unknown;
  }): Promise<void> {
    if (device.type !== 'camera') {
      throw new Error(`Unsupported device type: ${device.type}`);
    }

    const config = requireWithSchema(
      ThinginoConfigSchema,
      device.config,
      'Thingino configuration',
    );
    const client = new ThinginoHttpClient(
      config.origin.replace(/\/+$/, ''),
      config.token,
    );
    await client.getJson(client.agentPath('device'));
  }

  instantiateDeviceController(device: Device): DeviceController {
    const existing = this.controllers.get(device.id);
    if (existing) {
      return existing;
    }

    if (device.type !== 'camera') {
      throw new Error(
        `Unsupported device type for Thingino provider: ${device.type}`,
      );
    }

    const controller = new ThinginoDeviceController(device, this.deps);
    this.controllers.set(device.id, controller);
    controller.connect().catch((err) => {
      console.error(`Failed to connect to device ${device.id}:`, err);
    });
    return controller;
  }
}
