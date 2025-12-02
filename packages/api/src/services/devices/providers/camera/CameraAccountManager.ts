import type {
  AccountManager,
  DeviceController,
  DiscoveredDevice,
  ProviderDeps,
  Device,
  ProviderAccount,
} from '../../types.ts';
import {
  CameraConfigSchema,
  CameraDeviceController,
} from './CameraDeviceController.ts';
import { TypeCompiler } from '@sinclair/typebox/compiler';

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

  async validateDeviceConfig(device: {
    type: string;
    config: unknown;
  }): Promise<void> {
    if (device.type !== 'camera') {
      throw new Error(`Unsupported device type: ${device.type}`);
    }

    const validator = TypeCompiler.Compile(CameraConfigSchema);
    if (!validator.Check(device.config)) {
      const errors = [...validator.Errors(device.config)];
      throw new Error(
        `Invalid camera configuration: ${JSON.stringify(errors)}`,
      );
    }

    // Validate that the URL is reachable
    try {
      const controller = new CameraDeviceController(
        {
          id: 0, // Temporary ID
          provider_account_id: this.accountId,
          external_id: 'temp',
          name: 'temp',
          type: 'camera',
          config: device.config,
          enabled: 1,
          created_at: 0,
          updated_at: 0,
          last_seen: null,
          status: null,
        },
        this.deps,
      );

      // Try to capture a snapshot to verify the URL
      const result = await controller.captureSnapshot({
        timestamp: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventType: 'visit_entry' as any, // Dummy event type
      });

      if (!result) {
        throw new Error('Failed to capture snapshot from URL');
      }
    } catch (error) {
      throw new Error(
        `Failed to validate snapshot URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
