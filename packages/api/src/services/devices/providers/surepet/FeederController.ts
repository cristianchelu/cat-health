import type { DeviceStatus, SurePetFeederConfig, SureFeederState } from 'shared';
import type { DeviceController, Device, ProviderDeps } from '../../types.ts';
import type { SurePetDeviceDetailPayload } from './types.ts';
import { computeFillPercentages } from './mapFeedingEvent.ts';
import { computeBatteryPercent } from './constants.ts';
import { normalizeFeederBowls } from './normalizeFeederBowls.ts';

export class FeederController implements DeviceController {
  readonly deviceId: number;
  private device: Device;
  private deps: ProviderDeps;
  private config: SurePetFeederConfig;
  private status: DeviceStatus = 'unknown';
  private feederState: SureFeederState = { bowl_status: [] };
  private lastControl: unknown;

  constructor(device: Device, deps: ProviderDeps) {
    this.device = device;
    this.deps = deps;
    this.deviceId = device.id;
    this.config = device.config as unknown as SurePetFeederConfig;
  }

  async connect(): Promise<void> {
    this.status = 'online';
    this.deps.presence.reportOnline(this.deviceId);
  }

  async disconnect(): Promise<void> {
    this.status = 'offline';
    this.deps.presence.reportOffline(this.deviceId);
  }

  getStatus(): DeviceStatus {
    return this.status;
  }

  getState(): Record<string, unknown> {
    return { provider: 'surepet', ...this.feederState };
  }

  updateFromCloudPayload(payload: SurePetDeviceDetailPayload): void {
    const normalized = normalizeFeederBowls(payload);

    const fillPercentages = computeFillPercentages(
      normalized.bowlStatus,
      normalized.bowlSettings,
    );

    const batteryPercent = computeBatteryPercent(
      payload.status?.battery ?? undefined,
    );

    this.feederState = {
      bowl_status: normalized.bowlStatus,
      bowl_type: normalized.bowlType,
      bowl_type_label: normalized.bowlTypeLabel,
      bowl_settings: normalized.bowlSettings.length
        ? normalized.bowlSettings
        : undefined,
      fill_percentages: fillPercentages,
      lid_close_delay: payload.control?.lid?.close_delay ?? undefined,
      training_mode: payload.control?.training_mode ?? undefined,
      device_rssi: payload.status?.signal?.device_rssi ?? undefined,
      battery_percent: batteryPercent,
      last_refreshed_at: new Date().toISOString(),
    };
    this.lastControl = payload.control;

    const online = payload.status?.online;
    if (online === false) {
      this.status = 'offline';
      this.deps.presence.reportOffline(this.deviceId);
    } else {
      this.status = 'online';
      this.deps.presence.reportOnline(this.deviceId);
    }
  }

  getSurePetDeviceId(): number {
    return Number.parseInt(this.device.external_id, 10);
  }

  getDeviceControl(): unknown {
    return this.lastControl;
  }
}
