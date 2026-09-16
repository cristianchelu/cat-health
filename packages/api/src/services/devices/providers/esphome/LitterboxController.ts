import { sql } from 'kysely';
import {
  DEVICE_SIGNAL_KEYS,
  decodeLitterboxVisitFrame,
  type DeviceSignal,
} from 'shared';
import { LitterboxVisitTracker } from '../../../litterbox/LitterboxVisitTracker.ts';
import type { MqttMessageEvent } from '../../EventBus.ts';
import type { ProviderDeps, Device } from '../../types.ts';
import { daysRemainingSignal, measureSignal } from '../../signalBuilders.ts';
import {
  BaseESPHomeController,
  type ReconnectConfig,
} from './BaseESPHomeController.ts';
import { DEEP_CLEAN_BINDINGS, readSchedule } from './scheduleBindings.ts';

const SENSORS = {
  ACTIVITY: 'activity',
  UNFILTERED_WEIGHT: 'unfiltered_weight',
  WASTE_WEIGHT: 'waste_weight',
  LITTER_REMAINING: 'litter_remaining',
  LITTER_LEVEL: 'litter_level',
  LITTER_FULL: 'full_litter_weight',
  VISITS: 'visits_since_clean',
} as const;

/** The device publishes its visit record on this topic under its node. */
const VISIT_RECORD_TOPIC = 'visit/last';

/**
 * A capacity is an answer only while it is positive. An ESPHome number nobody
 * has typed into publishes its protobuf default, so an unset full-litter
 * weight arrives as a perfectly finite 0 — which is a placeholder, not a box
 * that holds nothing.
 */
const capacity = (value: number | null | undefined): number | null =>
  typeof value === 'number' && value > 0 ? value : null;

const TUNING: ReconnectConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  pingIntervalMs: 15000,
  stallTimeoutMs: 45000,
  connectTimeoutMs: 20000,
};

export class LitterboxController extends BaseESPHomeController {
  private readonly visits: LitterboxVisitTracker;
  private readonly onMqttMessage = (event: MqttMessageEvent) =>
    this.handleMqttMessage(event);

  constructor(device: Device, deps: ProviderDeps) {
    super(device, deps, TUNING);
    this.visits = new LitterboxVisitTracker(this.deviceId, {
      db: deps.db,
      eventBus: deps.eventBus,
      logger: deps.logger,
      readCounters: () => {
        const litterRemainingKg = this.sensorNumber(SENSORS.LITTER_REMAINING);
        return {
          wasteWeightG: this.sensorNumber(SENSORS.WASTE_WEIGHT) ?? undefined,
          litterRemainingG:
            litterRemainingKg !== null ? litterRemainingKg * 1000 : undefined,
          visitsSinceScoop: this.sensorNumber(SENSORS.VISITS) ?? undefined,
        };
      },
    });
  }

  protected get deviceTypeName(): string {
    return 'litterbox';
  }

  async connect(): Promise<void> {
    // Any broker account may carry this device's record; the topic names
    // the node, so the controller filters rather than picking an account.
    // Off before on keeps a repeated connect() at one listener.
    this.deps.eventBus.unsubscribe('mqtt.message', this.onMqttMessage);
    this.deps.eventBus.subscribe('mqtt.message', this.onMqttMessage);
    await super.connect();
  }

  async disconnect(): Promise<void> {
    this.deps.eventBus.unsubscribe('mqtt.message', this.onMqttMessage);
    this.visits.dispose();
    await super.disconnect();
  }

  protected onConnected(): void {
    void this.persistNodeName();
  }

  protected onEntitiesReceived(): void {}

  protected handleSensorUpdate(key: number, state: unknown): void {
    const activityKey = this.getEntityKey(SENSORS.ACTIVITY);
    if (activityKey !== null && key === activityKey) {
      const isActive = state === true || state === 1;
      console.log(`[Litterbox] Activity changed: ${isActive}`);
      this.visits.activityChanged(isActive);
    }

    if (this.visits.active) {
      const unfilteredWeightKey = this.getEntityKey(SENSORS.UNFILTERED_WEIGHT);
      if (unfilteredWeightKey !== null && key === unfilteredWeightKey) {
        if (typeof state === 'number') {
          this.visits.sample(state * 1000);
        }
      }
    }
  }

  private handleMqttMessage(event: MqttMessageEvent): void {
    const node = this.config.nodeName;
    if (!node || !isVisitRecordTopic(event.topic, node)) return;
    const decoded = decodeLitterboxVisitFrame(event.payload);
    if (!decoded.ok) {
      console.warn(
        `[Litterbox] ${event.topic}: visit record not usable (${decoded.reason})`,
      );
      return;
    }
    this.visits
      .ingestFrame(decoded.frame, event.payload)
      .then((outcome) => {
        console.log(`[Litterbox] ${event.topic}: ${outcome}`);
      })
      .catch((error) => {
        console.error(`[Litterbox] ${event.topic}: ingest failed`, error);
      });
  }

  /**
   * Written once, from what the device reports on connect. Patches the one
   * key inside the stored JSON so a concurrent config PATCH is never
   * reverted from a stale snapshot; does not bump updated_at because this
   * is a server-internal cache, not a user edit.
   */
  private async persistNodeName(): Promise<void> {
    const name = this.client.deviceInfo()?.name;
    if (!name || name === this.config.nodeName) return;
    try {
      await this.deps.db
        .updateTable('device')
        .set({
          config: sql`json_set(coalesce(config, '{}'), '$.nodeName', ${name})`,
        })
        .where('id', '=', this.deviceId)
        .execute();
      this.config.nodeName = name;
    } catch (error) {
      console.error(
        `Failed to persist node name for ${this.device.name}:`,
        error,
      );
    }
  }

  /**
   * The box reports total waste but not how it accumulated. The pip display
   * and the deposit count are attached later from the event log, by
   * `getDepositsSinceScoop`.
   */
  getSignals(): DeviceSignal[] {
    const signals: DeviceSignal[] = [];

    const wasteWeight = this.sensorNumber(SENSORS.WASTE_WEIGHT);
    if (wasteWeight !== null) {
      const threshold = this.config.wasteThresholdG;
      signals.push(
        measureSignal(
          { key: DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP, icon: 'waste' },
          Math.round(wasteWeight),
          {
            unit: 'g',
            severity: threshold
              ? { kind: 'ratio', value: wasteWeight / threshold }
              : undefined,
          },
        ),
      );
    }

    /*
     * Kilograms alone say nothing: 1.5 kg is a comfortable load in a shallow
     * box and nearly bare in a deep one. Only the owner knows which, and they
     * say so by typing a full weight into the box. Until they do, the card has
     * no litter row at all — a bar drawn against a guessed capacity, and an
     * urgency band read off it, would both be inventions, and the row would
     * hold the gauge against the counters that are actually anchored.
     */
    const litterFullKg =
      capacity(this.sensorNumber(SENSORS.LITTER_FULL)) ??
      capacity(this.config.litterFullKg);
    const litterRemainingKg = this.sensorNumber(SENSORS.LITTER_REMAINING);
    if (litterRemainingKg !== null && litterFullKg !== null) {
      /* Composite, as the waste row is: the value is the weight, since that is
       * what a bag of litter is sold and refilled in, while the bar and the
       * urgency band read the percentage the box derives from its own
       * capacity. Firmware that reports no percentage still gets both, divided
       * here. */
      const litterLevelPercent =
        this.sensorNumber(SENSORS.LITTER_LEVEL) ??
        (litterRemainingKg / litterFullKg) * 100;
      signals.push(
        measureSignal(
          { key: DEVICE_SIGNAL_KEYS.LITTER_REMAINING, icon: 'litter' },
          litterRemainingKg,
          {
            unit: 'kg',
            decimals: 1,
            fill: litterLevelPercent / 100,
            severity: { kind: 'percent', value: litterLevelPercent },
          },
        ),
      );
    }

    /* Whichever shape this firmware states the schedule in; the interval
     * gives the countdown a bar to be drawn against. */
    const deepClean = readSchedule(
      DEEP_CLEAN_BINDINGS,
      this.scheduleReader(),
      Date.now(),
    );
    if (deepClean) {
      signals.push(
        daysRemainingSignal(
          { key: DEVICE_SIGNAL_KEYS.DEEP_CLEAN, icon: 'clean' },
          deepClean.daysRemaining,
          deepClean.intervalDays,
        ),
      );
    }

    const visits = this.sensorNumber(SENSORS.VISITS);
    if (visits !== null) {
      signals.push(
        measureSignal(
          { key: DEVICE_SIGNAL_KEYS.VISITS_SINCE_CLEAN, icon: 'scoop' },
          visits,
        ),
      );
    }

    return [...signals, ...this.diagnosticSignals()];
  }
}

/** `<prefix>/<node>/visit/last`, whatever the account's prefix is. */
export function isVisitRecordTopic(topic: string, node: string): boolean {
  return topic.endsWith(`/${node}/${VISIT_RECORD_TOPIC}`);
}
