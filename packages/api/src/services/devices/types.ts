import type { Kysely } from 'kysely';
import type {
  DeviceSignal,
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
  /**
   * Device health, normalized away from vendor field names. Read from state
   * already in memory, so it stays synchronous and safe to call per row on the
   * devices list. Counters that need the event log are derived outside the
   * controller.
   */
  getSignals?(): DeviceSignal[];
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
  /**
   * Decide which provider-managed runtime state survives a config edit.
   *
   * Runtime state is derived from config, so a config change can invalidate it
   * — e.g. changing SurePet credentials makes a cached bearer token useless.
   * Only the provider knows which of its config keys matter, so the generic
   * account route delegates here rather than inspecting vendor field names.
   *
   * Return the runtime state to persist. Omit the method to keep it unchanged.
   */
  reconcileRuntimeState?(args: {
    previousConfig: unknown;
    nextConfig: unknown;
    runtimeState: unknown;
  }): Record<string, unknown>;
  /**
   * Veto a config edit the provider cannot honour for an already-wired account.
   *
   * Some config keys select *which* remote account is being talked to, so
   * changing them silently invalidates the `device.external_id`s already
   * persisted for this account (they name objects in the old remote account).
   * Only the provider knows which of its keys are identity-bearing, so the
   * generic route delegates here instead of inspecting vendor field names.
   *
   * Return a user-facing reason to refuse the PATCH with 400, or `null` to
   * allow it. Omit the method to always allow.
   */
  validateAccountConfigChange?(args: {
    previousConfig: unknown;
    nextConfig: unknown;
    registeredDeviceCount: number;
  }): string | null;
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
  /** False when the provider is unregistered or rejects the config. */
  validateAccountConfig(providerName: string, config: unknown): boolean;
  /** Runtime state to keep after a config edit. See DeviceProvider.reconcileRuntimeState. */
  reconcileRuntimeState(
    providerName: string,
    args: {
      previousConfig: unknown;
      nextConfig: unknown;
      runtimeState: unknown;
    },
  ): Record<string, unknown>;
  /**
   * Reason to reject a config edit, or null when it is allowed.
   * See DeviceProvider.validateAccountConfigChange.
   */
  validateAccountConfigChange(
    accountId: number,
    providerName: string,
    args: { previousConfig: unknown; nextConfig: unknown },
  ): Promise<string | null>;
  initializeAccount(accountId: number): Promise<void>;
  getAccountManager(accountId: number): AccountManager | undefined;
  instantiateDeviceController(device: Device): DeviceController | undefined;
  invalidateDeviceController(deviceId: number): Promise<void>;
  reconcileDeviceController(deviceId: number): Promise<void>;
  instantiateController(
    deviceId: number,
  ): Promise<DeviceController | undefined>;
  resolveLiveController(deviceId: number): Promise<LiveControllerResult>;
}

/** Why a route asking for a working controller cannot have one. */
export type LiveControllerFailure = 'missing' | 'disabled' | 'unavailable';

export type LiveControllerResult =
  | { ok: true; controller: DeviceController }
  | { ok: false; reason: LiveControllerFailure };
