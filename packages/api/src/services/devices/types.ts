import type { Kysely } from 'kysely';
import type { DeviceStatus, DeviceType, EventType } from 'shared';
import type { Database } from '../../database/index.ts';
import type { Device } from '../../database/types/DeviceTable.ts';
import type { ProviderAccount } from '../../database/types/ProviderAccountTable.ts';
import type { MediaManager, PendingMedia } from '../media/MediaManager.ts';
import type { EventBus } from './EventBus.ts';

export type { Device, ProviderAccount };

export interface Camera extends DeviceController {
  captureSnapshot(options: {
    timestamp: Date;
    eventType: EventType;
    crop?: { left: number; top: number; width: number; height: number };
    rotate?: number;
  }): Promise<PendingMedia | undefined>;
  getSnapshotBuffer(): Promise<Buffer | undefined>;
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
  validateDeviceConfig?(device: {
    type: DeviceType;
    config: unknown;
  }): Promise<void>;
}

export interface DeviceProvider {
  readonly name: string;
  readonly internal?: boolean;

  createAccountManager(
    account: ProviderAccount,
    deps: ProviderDeps,
  ): AccountManager;
  validateAccountConfig(config: unknown): boolean;
}
