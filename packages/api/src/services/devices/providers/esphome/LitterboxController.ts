import { sql } from 'kysely';
import {
  DEVICE_SIGNAL_KEYS,
  deriveLitterboxSampleRateHz,
  encodeLitterboxRawData,
  type DeviceSignal,
  type LitterboxRawDataV2Context,
} from 'shared';
import { getDepositsSinceScoop } from '../../../litterbox/depositsSinceScoop.ts';
import type { ProviderDeps, Device } from '../../types.ts';
import { daysRemainingSignal, measureSignal } from '../../signalBuilders.ts';
import { recordDeviceEvent } from '../../../events/recordDeviceEvent.ts';
import {
  BaseESPHomeController,
  type ReconnectConfig,
} from './BaseESPHomeController.ts';
import { StateAnalyzer, determineEliminationType } from './StateAnalyzer.ts';
import { DEEP_CLEAN_BINDINGS, readSchedule } from './scheduleBindings.ts';
import { persistedLitterboxSegments } from './persistedLitterboxSegments.ts';
import { attributionColumns } from '../../../../domain/eventAttribution.ts';

const MAINTENANCE_THRESHOLD = -20;
const NO_ELIMINATION_THRESHOLD = 10;

const SENSORS = {
  ACTIVITY: 'activity',
  UNFILTERED_WEIGHT: 'unfiltered_weight',
  WASTE_WEIGHT: 'waste_weight',
  LITTER_REMAINING: 'litter_remaining',
  LITTER_LEVEL: 'litter_level',
  LITTER_FULL: 'full_litter_weight',
  VISITS: 'visits_since_clean',
} as const;

/**
 * A capacity is an answer only while it is positive. An ESPHome number nobody
 * has typed into publishes its protobuf default, so an unset full-litter
 * weight arrives as a perfectly finite 0 — which is a placeholder, not a box
 * that holds nothing.
 */
const capacity = (value: number | null | undefined): number | null =>
  typeof value === 'number' && value > 0 ? value : null;

interface RawMeasurement {
  timestamp: Date;
  weight: number;
}

interface EventSession {
  startTime: Date;
  endTime?: Date;
  measurements: RawMeasurement[];
}

export class LitterboxController extends BaseESPHomeController {
  private currentSession: EventSession | null = null;

  constructor(device: Device, deps: ProviderDeps) {
    super(device, deps);
  }

  protected get deviceTypeName(): string {
    return 'litterbox';
  }

  protected get reconnectConfig(): ReconnectConfig {
    return {
      baseDelay: 1000,
      maxDelay: 30000,
      heartbeatTimeout: 30000,
      pingInterval: 15000,
      connectHandshakeTimeout: 20000,
    };
  }

  protected onConnected(): void {}

  protected onEntitiesReceived(): void {}

  protected handleSensorUpdate(key: number, state: unknown): void {
    const activityKey = this.getEntityKey(SENSORS.ACTIVITY);
    if (activityKey !== null && key === activityKey) {
      const isActive = state === true || state === 1;
      console.log(`[Litterbox] Activity changed: ${isActive}`);

      if (isActive && !this.currentSession) {
        this.startSession();
      } else if (!isActive && this.currentSession) {
        this.endSession();
      }
    }

    // Collect measurements during active session
    if (this.currentSession) {
      const unfilteredWeightKey = this.getEntityKey(SENSORS.UNFILTERED_WEIGHT);
      if (unfilteredWeightKey !== null && key === unfilteredWeightKey) {
        if (typeof state === 'number') {
          const weightGrams = state * 1000;
          console.log(
            `[Litterbox] Added measurement: ${weightGrams}g at ${new Date().toISOString()}`,
          );
          this.currentSession.measurements.push({
            timestamp: new Date(),
            weight: weightGrams,
          });
        }
      }
    }
  }

  private startSession() {
    console.log(`Starting litterbox session for ${this.device.name}`);
    this.deps.eventBus.publish('device.activity.start', {
      deviceId: this.deviceId,
      timestamp: new Date(),
    });
    this.currentSession = {
      startTime: new Date(),
      measurements: [],
    };
  }

  private async endSession() {
    if (!this.currentSession) return;

    console.log(`Ending litterbox session for ${this.device.name}`);
    this.currentSession.endTime = new Date();

    this.deps.eventBus.publish('device.activity.end', {
      deviceId: this.deviceId,
      timestamp: this.currentSession.endTime,
    });

    const session = this.currentSession;
    this.currentSession = null;

    // Process the session
    await this.processSession(session);
  }

  private async processSession(session: EventSession) {
    try {
      if (!session.endTime) return;

      const duration = session.endTime.getTime() - session.startTime.getTime();
      console.log(
        `[Litterbox] Processing session: duration=${duration}ms, measurements=${session.measurements.length}`,
      );

      if (duration < 10000) {
        console.log(`[Litterbox] Ignoring short session (${duration}ms)`);
        return;
      }

      if (session.measurements.length === 0) {
        console.log('[Litterbox] No measurements collected during session');
        return;
      }

      // Use final weight as elimination weight
      let finalWeightKg: number | undefined;

      if (session.measurements.length > 0) {
        finalWeightKg =
          session.measurements[session.measurements.length - 1].weight / 1000;
        console.log(
          `[Litterbox] Using last measurement as final weight: ${finalWeightKg}kg`,
        );
      } else {
        console.log('[Litterbox] Missing final weight reading');
        return;
      }

      const eliminationWeight = finalWeightKg * 1000;
      console.log(`[Litterbox] Final weight: ${eliminationWeight}g`);

      const measurements = session.measurements;
      const startTimeMs = session.startTime.getTime();
      const sampleOffsetsMs = measurements.map(
        (m) => m.timestamp.getTime() - startTimeMs,
      );

      // Get context data
      const contextData = await this.getContextData(session.startTime);
      console.log('[Litterbox] Context data:', contextData);

      // Encode raw data
      const rawData = Buffer.from(
        encodeLitterboxRawData({
          version: 2,
          startTimeMs,
          context: contextData,
          weights: measurements.map((m) => m.weight),
          sampleOffsetsMs,
        }),
      );
      const sampleRateHz = deriveLitterboxSampleRateHz({
        weights: measurements.map((m) => m.weight),
        sampleOffsetsMs,
      });

      if (eliminationWeight < MAINTENANCE_THRESHOLD) {
        console.log(
          `Detected maintenance event at ${session.startTime.toISOString()}: ${eliminationWeight}g`,
        );

        await recordDeviceEvent(this.deps, {
          deviceId: this.deviceId,
          timestamp: session.startTime,
          data: {
            type: 'litterbox_maintenance',
            maintenance_type: 'scoop',
          },
          raw_data: rawData,
          human_verified: false,
        });
      } else {
        const weights = measurements.map((m) => m.weight);
        const latestPetWeights = await this.getLatestPetWeights(
          session.startTime,
        );
        const knownWeights = Array.from(latestPetWeights.values()).sort(
          (a, b) => a - b,
        );
        const petIdsByWeight = new Map<number, number>();
        for (const [pid, w] of latestPetWeights) {
          petIdsByWeight.set(w, pid);
        }

        const analyzer = new StateAnalyzer(knownWeights, sampleRateHz);
        const analysis = analyzer.processEvent(weights);

        let petId: number | null = null;
        if (
          analysis.detectedCatIndex >= 0 &&
          analysis.detectedCatIndex < knownWeights.length
        ) {
          const detectedWeight = knownWeights[analysis.detectedCatIndex];
          petId = petIdsByWeight.get(detectedWeight) ?? null;
          console.log(
            `[Litterbox] Identified pet ${petId} via presence (index=${analysis.detectedCatIndex}, knownWeight=${detectedWeight}g, presenceCounts=${JSON.stringify(analysis.catPresence)})`,
          );
        } else {
          console.log(
            `[Litterbox] No cat identified via presence (presenceCounts=${JSON.stringify(analysis.catPresence)})`,
          );
        }

        const eliminationType = determineEliminationType(analysis.periods);
        const straining =
          eliminationType !== 'no_elimination' &&
          eliminationWeight < NO_ELIMINATION_THRESHOLD;

        const segments = persistedLitterboxSegments(analysis.periods);

        const insertedEventId = await recordDeviceEvent(this.deps, {
          deviceId: this.deviceId,
          timestamp: session.startTime,
          data: {
            type: 'litterbox_use',
            elimination_type: eliminationType,
            elimination_weight: Math.round(Math.max(0, eliminationWeight)),
            duration: Math.round(duration / 1000),
            sample_rate_hz: sampleRateHz,
            straining,
            segments,
          },
          pet_id: petId,
          // The load cell matched a known cat's weight; that is the whole basis.
          attributed_by: 'weight',
          raw_data: rawData,
          human_verified: false,
        });

        if (petId !== null && analysis.catWeight > 0) {
          await this.deps.db
            .insertInto('event')
            .values({
              parent_event_id: insertedEventId,
              ...attributionColumns('pet', petId, 'weight'),
              device_id: this.deviceId,
              timestamp: session.startTime,
              data: {
                type: 'weight_measurement',
                weight: Math.round(analysis.catWeight),
              },
              raw_data: null,
              human_verified: false,
            })
            .execute();
        }

        console.log(
          `Recorded litterbox use event for pet ${petId || 'unknown'}`,
        );
      }
    } catch (error) {
      console.error('Error processing session:', error);
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

  /**
   * Box state as the cat entered, snapshotted into the v2 blob. Sensor
   * readings pass through at full precision; the event-log-derived fields
   * are queried before the visit itself is inserted, so they describe the
   * box at entry and stay immune to later event edits or re-analyses.
   */
  private async getContextData(
    sessionStart: Date,
  ): Promise<LitterboxRawDataV2Context> {
    const wasteWeight = this.sensorNumber(SENSORS.WASTE_WEIGHT);
    const litterRemainingKg = this.sensorNumber(SENSORS.LITTER_REMAINING);
    const visitsSinceScoop = this.sensorNumber(SENSORS.VISITS);

    // The deep_clean_timer sensor is a countdown against an arbitrary,
    // user-adjustable preset; litter age comes from the event log instead.
    const lastDeepClean = await this.deps.db
      .selectFrom('event')
      .select(({ fn }) => [fn.max('timestamp').as('last_deep_clean_at')])
      .where('device_id', '=', this.deviceId)
      .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_maintenance')
      .where(sql`json_extract(data, '$.maintenance_type')`, 'in', [
        'deep_clean',
        'litter_change',
      ])
      .executeTakeFirst();

    const daysSinceDeepClean = lastDeepClean?.last_deep_clean_at
      ? Math.max(
          0,
          Math.floor(
            (sessionStart.getTime() -
              new Date(lastDeepClean.last_deep_clean_at).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : undefined;

    // Mirrors the device-card pip counter (14-day lookback); an absent
    // entry is that counter's "no deposits", so it is recorded as 0.
    const deposits = (
      await getDepositsSinceScoop(this.deps.db, [this.deviceId])
    ).get(this.deviceId);
    const pips = deposits?.pips ?? [];
    const urinationsSinceScoop = pips.filter(
      (pip) => pip === 'urination' || pip === 'both',
    ).length;
    const defecationsSinceScoop = pips.filter(
      (pip) => pip === 'defecation' || pip === 'both',
    ).length;

    return {
      wasteWeight: wasteWeight ?? undefined,
      litterRemaining:
        litterRemainingKg !== null ? litterRemainingKg * 1000 : undefined,
      daysSinceDeepClean,
      visitsSinceScoop: visitsSinceScoop ?? undefined,
      urinationsSinceScoop,
      defecationsSinceScoop,
    };
  }

  private async getLatestPetWeights(
    beforeTimestamp: Date,
  ): Promise<Map<number, number>> {
    const latestWeights = new Map<number, number>();

    // Query latest weight measurement for each pet before the given timestamp
    const weightEvents = await this.deps.db
      .selectFrom('event')
      .select(['pet_id', 'data', 'timestamp'])
      .where('timestamp', '<', beforeTimestamp)
      .where('pet_id', 'is not', null)
      .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
      .orderBy('timestamp', 'desc')
      .execute();

    // Group by pet_id and take the latest weight for each pet
    const petLatestWeights = new Map<
      number,
      { weight: number; timestamp: Date }
    >();

    for (const event of weightEvents) {
      if (event.pet_id !== null) {
        const petId = event.pet_id;
        const eventData = event.data;

        if (
          eventData.type === 'weight_measurement' &&
          typeof eventData.weight === 'number'
        ) {
          // Only keep this weight if we haven't seen a more recent one for this pet
          if (
            !petLatestWeights.has(petId) ||
            event.timestamp > petLatestWeights.get(petId)!.timestamp
          ) {
            petLatestWeights.set(petId, {
              weight: eventData.weight,
              timestamp: event.timestamp,
            });
          }
        }
      }
    }

    // Convert to simple pet_id -> weight mapping
    for (const [petId, data] of petLatestWeights) {
      latestWeights.set(petId, data.weight);
    }

    return latestWeights;
  }
}
