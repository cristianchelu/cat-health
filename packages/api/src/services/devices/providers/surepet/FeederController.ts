import {
  DEVICE_SIGNAL_KEYS,
  requireWithSchema,
  SurePetFeederConfigSchema,
  type DeviceSignal,
  type DeviceStatus,
  type SignalSplitCell,
  type SureFeederState,
} from 'shared';
import type { SurePetFeederConfig } from 'shared';
import type { DeviceController, Device, ProviderDeps } from '../../types.ts';
import type { SurePetDeviceDetailPayload } from './types.ts';
import { computeFillPercentages } from './mapFeedingEvent.ts';
import {
  computeBatteryPercent,
  FoodType,
  SUREPET_RSSI_LADDER,
} from './constants.ts';
import { normalizeFeederBowls } from './normalizeFeederBowls.ts';
import {
  batterySignal,
  signalStrengthSignal,
  timestampSignal,
} from '../../signalBuilders.ts';

/**
 * A bowl's fill against its target, made safe to display and to score.
 *
 * The ratio is unbounded in both directions: a topped-up bowl reads over 100%,
 * and a bowl lifted off the scale or left untared reads negative. Neither is a
 * food level. Overfill is clamped to full, which is what it means, and a
 * negative reading is discarded rather than shown as an empty bowl — the scale
 * is not reporting against the target, and "0%" would be a false alarm.
 */
function normalizeFill(percent: number | null | undefined): number | null {
  if (percent == null || !Number.isFinite(percent) || percent < 0) {
    return null;
  }
  return Math.min(100, percent);
}

/**
 * The emptiest bowl decides, since one empty bowl beside a full one still
 * needs filling. Bowls with no usable reading are skipped rather than counted
 * as empty; if none are usable there is nothing to judge.
 */
function bowlSeverity(
  percents: ReadonlyArray<number | null>,
): DeviceSignal['severity'] {
  const usable = percents.filter(
    (percent): percent is number => percent != null,
  );
  return usable.length > 0
    ? { kind: 'percent', value: Math.min(...usable) }
    : undefined;
}

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
    this.config = requireWithSchema(
      SurePetFeederConfigSchema,
      device.config,
      'SurePet feeder configuration',
    );
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

  getSignals(): DeviceSignal[] {
    const signals: DeviceSignal[] = [];
    const fill = this.feederState.fill_percentages;
    const perBowl = fill
      ? Object.entries(fill.per_bowl).map(
          ([key, percent]) => [key, normalizeFill(percent)] as const,
        )
      : [];

    /* Two bowls share one slot rather than taking one each: the pair is a
     * single question ("is there food?") that a dual-scale answers twice. */
    if (perBowl.length === 2) {
      signals.push({
        key: DEVICE_SIGNAL_KEYS.FEEDER_FILL,
        label_key: `devices.signals.${DEVICE_SIGNAL_KEYS.FEEDER_FILL}`,
        value: { kind: 'none' },
        display: {
          kind: 'split',
          cells: [
            this.bowlCell(perBowl[0][0], perBowl[0][1]),
            this.bowlCell(perBowl[1][0], perBowl[1][1]),
          ],
        },
        icon: 'food',
        category: 'primary',
        severity: bowlSeverity(perBowl.map(([, percent]) => percent)),
      });
    } else {
      const total = normalizeFill(fill?.total ?? null);
      signals.push({
        key: DEVICE_SIGNAL_KEYS.FEEDER_FILL,
        label_key: `devices.signals.${DEVICE_SIGNAL_KEYS.FEEDER_FILL}`,
        value:
          total == null
            ? { kind: 'none' }
            : { kind: 'percent', value: Math.round(total) },
        display: { kind: 'bar', fill: (total ?? 0) / 100 },
        icon: 'food',
        category: 'primary',
        severity: bowlSeverity([total]),
      });
    }

    if (this.feederState.battery_percent != null) {
      signals.push(batterySignal(this.feederState.battery_percent));
    }

    if (this.feederState.device_rssi != null) {
      signals.push(
        signalStrengthSignal(this.feederState.device_rssi, SUREPET_RSSI_LADDER),
      );
    }

    if (this.feederState.last_refreshed_at) {
      signals.push(
        timestampSignal(
          { key: DEVICE_SIGNAL_KEYS.LAST_REFRESHED, icon: 'clock' },
          this.feederState.last_refreshed_at,
        ),
      );
    }

    return signals;
  }

  /** A bowl's cell in the split gauge, labelled by the food it is set to hold. */
  private bowlCell(bowlKey: string, percent: number | null): SignalSplitCell {
    const index = Number.parseInt(bowlKey, 10);
    const foodType = this.feederState.bowl_settings?.[index]?.food_type;
    const labelKey =
      foodType === FoodType.WET
        ? 'devices.signals.values.food_wet'
        : foodType === FoodType.DRY
          ? 'devices.signals.values.food_dry'
          : 'devices.signals.values.bowl';

    return {
      label_key: labelKey,
      value:
        percent == null
          ? { kind: 'none' }
          : { kind: 'percent', value: Math.round(percent) },
      fill: percent == null ? 0 : Math.min(1, Math.max(0, percent / 100)),
    };
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

  /** Refresh in-memory device row after PATCH without tearing down presence. */
  updateDevice(device: Device): void {
    this.device = device;
    this.config = requireWithSchema(
      SurePetFeederConfigSchema,
      device.config,
      'SurePet feeder configuration',
    );
  }
}
