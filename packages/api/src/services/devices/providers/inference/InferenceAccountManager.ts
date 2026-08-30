import type {
  AccountManager,
  DeviceController,
  DiscoveredDevice,
  Device,
  ProviderAccount,
} from '../../types.ts';

/**
 * An inference account owns no devices.
 *
 * Recognition used to arrive as a `pet_recognizer` device this manager
 * connected; it is now an attachment on the observed device, driven by
 * `RecognitionService` out of one subscription. What is left is the degenerate
 * manager `IntegrationManager` still requires so the account can be listed,
 * validated and switched off like any other.
 */
export class InferenceAccountManager implements AccountManager {
  readonly accountId: number;

  constructor(account: ProviderAccount) {
    this.accountId = account.id;
  }

  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {}

  async invalidateDeviceController(): Promise<void> {}

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    return [];
  }

  instantiateDeviceController(device: Device): DeviceController {
    throw new Error(
      `Unsupported device type for Inference provider: ${device.type}`,
    );
  }
}
