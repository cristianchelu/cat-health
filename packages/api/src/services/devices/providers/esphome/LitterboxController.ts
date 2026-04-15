import { sql } from 'kysely';
import { encodeLitterboxRawData } from 'shared';
import type { NewEvent } from '../../../../database/types/EventTable.ts';
import type { ProviderDeps, Device } from '../../types.ts';
import {
  BaseESPHomeController,
  type ReconnectConfig,
} from './BaseESPHomeController.ts';
import { StateAnalyzer, determineEliminationType } from './StateAnalyzer.ts';
import { persistedLitterboxSegments } from './persistedLitterboxSegments.ts';

const MAINTENANCE_THRESHOLD = -20;
const NO_ELIMINATION_THRESHOLD = 10;

const SENSORS = {
  ACTIVITY: 'activity',
  UNFILTERED_WEIGHT: 'unfiltered_weight',
  WASTE_WEIGHT: 'waste_weight',
  LITTER_REMAINING: 'litter_remaining',
  DEEP_CLEAN_TIMER: 'deep_clean_timer',
  VISITS: 'visits_since_clean',
} as const;

interface RawMeasurement {
  timestamp: Date;
  weight: number;
}

interface EventSession {
  startTime: Date;
  endTime?: Date;
  measurements: RawMeasurement[];
}

interface ContextData {
  wasteWeight: number;
  litterRemaining: number;
  deepCleanTimer: number;
  totalVisits: number;
  daysSinceLitterReplaced: number;
  hoursSinceLastScoop: number;
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

  protected onConnected(): void { }

  protected onEntitiesReceived(): void { }

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

      // Get context data
      const contextData = this.getContextData();
      console.log('[Litterbox] Context data:', contextData);

      // Encode raw data
      const rawData = Buffer.from(
        encodeLitterboxRawData({
          version: 1,
          startTimeMs: session.startTime.getTime(),
          context: contextData || undefined,
          weights: measurements.map((m) => m.weight),
        }),
      );

      if (eliminationWeight < MAINTENANCE_THRESHOLD) {
        console.log(
          `Detected maintenance event at ${session.startTime.toISOString()}: ${eliminationWeight}g`,
        );

        const event: NewEvent = {
          pet_id: null,
          device_id: this.deviceId,
          timestamp: session.startTime,
          data: {
            type: 'litterbox_maintenance',
            maintenance_type: 'scoop',
          },
          raw_data: rawData,
          human_verified: false,
        };

        const inserted = await this.deps.db
          .insertInto('event')
          .values(event)
          .returning(['id'])
          .executeTakeFirstOrThrow();

        this.deps.eventBus.publish('device.event', {
          deviceId: this.deviceId,
          eventId: inserted.id,
          type: 'litterbox_maintenance',
          data: event.data,
          timestamp: session.startTime,
        });
      } else {
        // Use event: run state analysis for accurate catWeight and elimination type
        const weights = measurements.map((m) => m.weight);
        const knownWeights = Array.from(
          (await this.getLatestPetWeights(session.startTime)).values(),
        );
        const analyzer = new StateAnalyzer(knownWeights);
        const analysis = analyzer.processEvent(weights);

        const petId = await this.determinePetId(
          analysis.catWeight,
          session.startTime,
        );

        const eliminationType = determineEliminationType(analysis.periods);
        const straining = eliminationType !== 'no_elimination' && eliminationWeight < NO_ELIMINATION_THRESHOLD;

        const segments = persistedLitterboxSegments(analysis.periods);

        const event: NewEvent = {
          pet_id: petId,
          device_id: this.deviceId,
          timestamp: session.startTime,
          data: {
            type: 'litterbox_use',
            elimination_type: eliminationType,
            elimination_weight: Math.round(Math.max(0, eliminationWeight)),
            duration: Math.round(duration / 1000),
            straining,
            segments,
          },
          raw_data: rawData,
          human_verified: false,
        };

        const insertedEvent = await this.deps.db
          .insertInto('event')
          .values(event)
          .returning(['id'])
          .executeTakeFirstOrThrow();

        if (petId !== null && analysis.catWeight > 0) {
          await this.deps.db
            .insertInto('event')
            .values({
              parent_event_id: insertedEvent.id,
              pet_id: petId,
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

        this.deps.eventBus.publish('device.event', {
          deviceId: this.deviceId,
          eventId: insertedEvent.id,
          type: 'litterbox_use',
          data: event.data,
          timestamp: session.startTime,
        });

        console.log(
          `Recorded litterbox use event for pet ${petId || 'unknown'}`,
        );
      }
    } catch (error) {
      console.error('Error processing session:', error);
    }
  }

  private getContextData(): ContextData | null {
    const wasteWeightKey = this.getEntityKey(SENSORS.WASTE_WEIGHT);
    const litterRemainingKey = this.getEntityKey(SENSORS.LITTER_REMAINING);
    const deepCleanTimerKey = this.getEntityKey(SENSORS.DEEP_CLEAN_TIMER);
    const visitsKey = this.getEntityKey(SENSORS.VISITS);

    const wasteWeight = wasteWeightKey !== null
      ? (this.sensorValues.get(wasteWeightKey) as number) || 0
      : 0;
    const litterRemaining = litterRemainingKey !== null
      ? ((this.sensorValues.get(litterRemainingKey) as number) || 0) * 1000 // kg to g
      : 0;
    const deepCleanTimer = deepCleanTimerKey !== null
      ? (this.sensorValues.get(deepCleanTimerKey) as number) || 0
      : 0;
    const totalVisits = visitsKey !== null
      ? (this.sensorValues.get(visitsKey) as number) || 0
      : 0;

    // Derived metrics
    const daysSinceLitterReplaced = Math.max(
      0,
      Math.round(30 - deepCleanTimer),
    );

    // We don't have easy access to "last scoop time" without querying DB or keeping state.
    // For now, we'll set hoursSinceLastScoop to 0 or try to estimate if we want.
    // The migrator queried InfluxDB for last time waste was 0.
    // We can skip this for now or implement it later.
    const hoursSinceLastScoop = 0;

    return {
      wasteWeight,
      litterRemaining,
      deepCleanTimer,
      totalVisits,
      daysSinceLitterReplaced,
      hoursSinceLastScoop,
    };
  }

  private async determinePetId(
    catWeight: number,
    eventTimestamp: Date,
  ): Promise<number | null> {
    const latestWeights = await this.getLatestPetWeights(eventTimestamp);

    if (latestWeights.size === 0) {
      console.log(
        `[Litterbox] No weight measurements found before ${eventTimestamp.toISOString()}, cannot determine pet`,
      );
      return null;
    }

    console.log(`[Litterbox] Determining pet for cat weight: ${catWeight}g`);
    console.log(
      `[Litterbox] Latest pet weights:`,
      Object.fromEntries(latestWeights),
    );

    let closestPetId: number | null = null;
    let minDiff = Infinity;
    const marginPercent = 0.1; // 10% margin

    for (const [petId, knownWeight] of latestWeights) {
      const diff = Math.abs(catWeight - knownWeight);
      const margin = knownWeight * marginPercent;

      console.log(
        `[Litterbox] Checking pet ${petId} (weight: ${knownWeight}g), diff: ${diff}g, margin: ${margin}g`,
      );

      if (diff <= margin && diff < minDiff) {
        minDiff = diff;
        closestPetId = petId;
      }
    }

    if (closestPetId === null) {
      console.log(
        `No cat found within 10% margin for cat weight ${catWeight}g`,
      );
    } else {
      const knownWeight = latestWeights.get(closestPetId)!;
      console.log(
        `Identified cat ${closestPetId} (weight: ${knownWeight}g) for cat weight ${catWeight}g`,
      );
    }

    return closestPetId;
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
