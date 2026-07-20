import type { Kysely } from 'kysely';
import type {
  DeviceStatus,
  DeviceType,
  EventType,
  GetProviderRemotePetsResponseDTO,
  ProviderCapabilities,
} from 'shared';
import type { Database } from '../../database/index.ts';
import type { Device } from '../../database/types/DeviceTable.ts';
import type { ProviderAccount } from '../../database/types/ProviderAccountTable.ts';
import type { MediaManager, PendingMedia } from '../media/MediaManager.ts';
import type { DevicePresence } from './DevicePresence.ts';
import type { EventBus } from './EventBus.ts';

export type { Device, ProviderAccount };

export interface Camera extends DeviceController {
  captureSnapshot(options: {
    timestamp: Date;
    crop?: { left: number; top: number; width: number; height: number };
    rotate?: number;
  }): Promise<PendingMedia | undefined>;
  getSnapshotBuffer(): Promise<Buffer | undefined>;
}

export type RecordingResult =
  | { type: 'local'; pendingMedia: PendingMedia; mimeType: string }
  | {
      type: 'remote';
      url: string;
      provider: string;
      externalId?: string;
      mimeType: string;
    };

export interface RecordingSource extends DeviceController {
  fetchRecording(options: {
    startTime: Date;
    endTime: Date;
    eventType: EventType;
    transforms?: {
      crop?: { left: number; top: number; width: number; height: number };
      rotate?: number;
    };
  }): Promise<RecordingResult>;
}

export interface DeviceDirectory {
  instantiateController(
    deviceId: number,
  ): Promise<DeviceController | undefined>;
  getLinkedCamera(deviceId: number): Promise<Camera | undefined>;
}

export interface ProviderDeps {
  db: Kysely<Database>;
  eventBus: EventBus;
  mediaManager: MediaManager;
  directory: DeviceDirectory;
  presence: DevicePresence;
  // scheduler: Scheduler; // Not implemented yet, skipping for now
  logger: Console; // Using console for now
}

export interface DeviceController {
  readonly deviceId: number;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): DeviceStatus;
  getState?(): Record<string, unknown>;
}

export function isCamera(controller: DeviceController): controller is Camera {
  if (
    !('captureSnapshot' in controller) ||
    !('getSnapshotBuffer' in controller)
  ) {
    return false;
  }
  const candidate = controller as Camera;
  return (
    typeof candidate.captureSnapshot === 'function' &&
    typeof candidate.getSnapshotBuffer === 'function'
  );
}

export interface DiscoveredDevice {
  externalId: string;
  name: string;
  type: DeviceType;
  config: Record<string, unknown>;
}

export interface AccountManager {
  readonly accountId: number;

  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  discoverDevices(): Promise<DiscoveredDevice[]>;
  instantiateDeviceController(device: Device): DeviceController;
  /** Teardown and clear cached controller for a device (e.g. after config update). */
  invalidateDeviceController?(deviceId: number): Promise<void>;
  validateDeviceConfig?(device: {
    type: DeviceType;
    config: unknown;
  }): Promise<void>;
  listRemotePets?(): Promise<GetProviderRemotePetsResponseDTO>;
  onDeviceRegistered?(device: Device): Promise<void>;
}

export interface DeviceProvider {
  readonly name: string;
  readonly internal?: boolean;
  readonly capabilities: ProviderCapabilities;

  createAccountManager(
    account: ProviderAccount,
    deps: ProviderDeps,
  ): AccountManager;
  validateAccountConfig(config: unknown): boolean;
}

export type ProviderListing = {
  name: string;
  internal: boolean;
  capabilities: ProviderCapabilities;
};

/** Route-facing slice of IntegrationManager (device routes + tests). */
export interface DeviceIntegrationContext {
  getPresence(): DevicePresence;
  getProviders(): ProviderListing[];
  initializeAccount(accountId: number): Promise<void>;
  getAccountManager(accountId: number): AccountManager | undefined;
  instantiateDeviceController(device: Device): DeviceController | undefined;
  invalidateDeviceController(deviceId: number): Promise<void>;
  instantiateController(
    deviceId: number,
  ): Promise<DeviceController | undefined>;
}
