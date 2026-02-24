import { sql } from 'kysely';
import type { LitterboxUseEliminationType } from 'shared';
import type { NewEvent } from '../../../../database/types/EventTable.ts';
import type { ProviderDeps, Device } from '../../types.ts';
import {
  BaseESPHomeController,
  type ReconnectConfig,
} from './BaseESPHomeController.ts';

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

// --- State analyzer (plateau detection for accurate cat weight and elimination type) ---

interface StatePeriod {
  state: string;
  start: number;
  end: number;
  variance?: number;
}

interface StateResult {
  state: string;
  catWeight: number;
  wasteWeight: number;
  periods: StatePeriod[];
}

type StateTransition = { from: string; to: string; index: number };

class Ring {
  private buf: number[];
  private i = 0;
  private filled = 0;
  private n: number;

  constructor(n: number) {
    this.buf = new Array(n).fill(0);
    this.n = n;
  }

  push(x: number): void {
    this.buf[this.i] = x;
    this.i = (this.i + 1) % this.n;
    this.filled = Math.min(this.filled + 1, this.n);
  }

  mean(): number {
    if (!this.filled) return 0;
    let s = 0;
    for (let k = 0; k < this.filled; k++) s += this.buf[k];
    return s / this.filled;
  }

  variance(): number {
    if (this.filled < 2) return 0;
    const m = this.mean();
    let s = 0;
    for (let k = 0; k < this.filled; k++) {
      const d = this.buf[k] - m;
      s += d * d;
    }
    return s / (this.filled - 1);
  }

  every(fn: (v: number) => boolean): boolean {
    return this.buf.every(fn);
  }

  first(): number | undefined {
    return this.filled ? this.buf[0] : undefined;
  }

  last(): number | undefined {
    return this.filled ? this.buf[(this.i + this.n - 1) % this.n] : undefined;
  }

  size(): number {
    return this.filled;
  }

  toArray(): number[] {
    const result: number[] = [];
    for (let k = 0; k < this.filled; k++) {
      result.push(this.buf[k]);
    }
    return result;
  }
}

class StateAnalyzer {
  private states = {
    EMPTY: 'empty',
    ENTERING: 'entering',
    OCCUPIED: 'occupied',
    ELIMINATING: 'eliminating',
    GAP: 'gap',
    ENDED: 'ended',
  };

  private hz = 10;
  private varStable = Math.sqrt(250);
  private stableMergeGap = 1.5 * this.hz;
  private entryDeltaMin = 1200;
  private entryDeltaFrac = 0.22;
  private presenceFrac = 0.28;
  private exitHold = 6;
  private reentryWindow = 15 * this.hz;
  private maxSession = 10 * 60 * this.hz;
  private knownPresenceTol = 0.1;
  private windowSize = 10;

  private currentState = this.states.EMPTY;
  private knownCatWeights: number[];
  private window = new Ring(this.windowSize);
  private weightHistory = new Ring(this.windowSize);
  private meanHistory = new Ring(3);
  private exitBelowCnt = 0;
  private gapCnt = 0;
  private stableCnt = 0;
  private sessionActive = false;
  private sessionStartSample = 0;
  private currentSample = 0;
  private wasteWeight = 0;
  private catWeight = 0;
  private bestStableWeight = 0;
  private bestStableDur = 0;
  private transitions: StateTransition[] = [];

  constructor(knownCatWeights?: number[]) {
    this.knownCatWeights =
      knownCatWeights && knownCatWeights.length
        ? knownCatWeights.slice().sort((a, b) => a - b)
        : [];
  }

  processSample(weight: number, index: number): void {
    this.currentSample = index;
    this.window.push(weight);
    this.weightHistory.push(weight);
    const mean1s = this.window.mean();
    this.meanHistory.push(mean1s);
    const var10sample = Math.sqrt(this.weightHistory.variance());
    const stableNow = var10sample > 0 && var10sample < this.varStable;

    if (
      this.sessionActive &&
      this.currentSample - this.sessionStartSample > this.maxSession
    ) {
      return;
    }

    const entryDelta = this.entryThreshold();
    const presenceThreshold =
      this.catWeight > 0 ? this.catWeight * this.presenceFrac : entryDelta;

    switch (this.currentState) {
      case this.states.EMPTY: {
        if (mean1s > entryDelta) {
          this.startSession();
          this.transitionTo(this.states.ENTERING);
        }
        break;
      }
      case this.states.ENTERING: {
        if (!this.confirmPresence(mean1s)) {
          if (mean1s < 0.5 * this.entryThreshold()) {
            this.transitionTo(this.states.GAP, this.windowSize / 2);
          }
          break;
        }
        if (
          this.meanHistory.variance() < 10 &&
          this.meanHistory.every((m) => this.nearKnownCatWeight(m))
        ) {
          this.transitionTo(this.states.OCCUPIED, this.windowSize / 2);
        } else {
          this.stableCnt = 0;
        }
        break;
      }
      case this.states.OCCUPIED: {
        if (stableNow) {
          if (this.nearKnownCatWeight(mean1s)) {
            this.transitionTo(this.states.ELIMINATING);
          }
        }
        if (weight < entryDelta) {
          this.transitionTo(this.states.GAP, this.windowSize);
          this.exitBelowCnt = 0;
          break;
        }
        if (
          this.catWeight > 0 &&
          this.catWeight - mean1s > presenceThreshold
        ) {
          this.exitBelowCnt++;
          if (this.exitBelowCnt >= this.exitHold) {
            this.exitBelowCnt = 0;
            this.gapCnt = 0;
            this.transitionTo(this.states.ENTERING, this.windowSize);
          }
        } else {
          this.exitBelowCnt = 0;
        }
        break;
      }
      case this.states.ELIMINATING: {
        if (stableNow) {
          this.stableCnt++;
        } else {
          this.updateCatWeightEstimate(mean1s, this.stableCnt);
          this.stableCnt = 0;
          this.transitionTo(this.states.OCCUPIED);
        }
        if (
          this.catWeight > 0 &&
          this.catWeight - mean1s > presenceThreshold
        ) {
          this.exitBelowCnt++;
          if (this.exitBelowCnt >= this.exitHold) {
            this.exitBelowCnt = 0;
            this.gapCnt = 0;
            this.transitionTo(this.states.GAP);
          }
        } else {
          this.exitBelowCnt = 0;
        }
        break;
      }
      case this.states.GAP: {
        this.gapCnt++;
        if (mean1s > entryDelta) {
          if (stableNow) {
            if (this.nearKnownCatWeight(mean1s)) {
              this.transitionTo(this.states.ELIMINATING);
            }
          } else {
            this.transitionTo(this.states.ENTERING);
          }
        } else if (this.gapCnt > this.reentryWindow) {
          this.wasteWeight = weight;
          return;
        }
        break;
      }
      case this.states.ENDED: {
        return;
      }
    }
  }

  private updateCatWeightEstimate(
    stableWeight: number,
    durationSamples: number,
  ): void {
    if (durationSamples > this.bestStableDur) {
      this.bestStableDur = durationSamples;
      this.bestStableWeight = stableWeight;
    }
    if (this.catWeight <= 0) this.catWeight = this.bestStableWeight;
    else this.catWeight = 0.9 * this.catWeight + 0.1 * this.bestStableWeight;
  }

  private postProcessTransitions(): StatePeriod[] {
    if (!this.transitions.length) return [];

    let initialPeriods: StatePeriod[] = [];
    for (let i = 0; i < this.transitions.length; i++) {
      const currentTransition = this.transitions[i];
      const start =
        i === 0 ? this.sessionStartSample : currentTransition.index;
      const end = this.transitions[i + 1]
        ? this.transitions[i + 1].index
        : this.currentSample;
      initialPeriods.push({ state: currentTransition.to, start, end });
    }

    initialPeriods = initialPeriods.filter(
      (p) => p.state !== this.states.EMPTY && p.end > p.start,
    );

    for (let i = 1; i < initialPeriods.length - 1; i++) {
      const prev = initialPeriods[i - 1];
      const curr = initialPeriods[i];
      const next = initialPeriods[i + 1];
      if (
        prev.state === this.states.ELIMINATING &&
        curr.state === this.states.OCCUPIED &&
        next.state === this.states.ELIMINATING &&
        curr.end - curr.start < this.stableMergeGap &&
        prev.end - prev.start > 1 * this.hz &&
        next.end - next.start > 1 * this.hz
      ) {
        prev.end = next.end;
        initialPeriods.splice(i, 2);
        i--;
      }
    }

    const minEliminationDuration = 5 * this.hz;
    initialPeriods.forEach((p) => {
      if (
        p.state === this.states.ELIMINATING &&
        p.end - p.start < minEliminationDuration
      ) {
        p.state = this.states.OCCUPIED;
      }
    });

    if (initialPeriods.length === 0) return [];

    const mergedPeriods: StatePeriod[] = [{ ...initialPeriods[0] }];
    for (let i = 1; i < initialPeriods.length; i++) {
      const currentPeriod = initialPeriods[i];
      const lastMergedPeriod = mergedPeriods[mergedPeriods.length - 1];
      if (currentPeriod.state === lastMergedPeriod.state) {
        lastMergedPeriod.end = currentPeriod.end;
      } else {
        mergedPeriods.push({ ...currentPeriod });
      }
    }
    return mergedPeriods;
  }

  private getSessionSummary(): StateResult {
    const finalStatePeriods = this.postProcessTransitions();
    return {
      state: this.states.ENDED,
      catWeight: this.catWeight || this.bestStableWeight,
      wasteWeight: this.wasteWeight,
      periods: finalStatePeriods,
    };
  }

  processEvent(weights: number[]): StateResult {
    this.reset();
    for (let i = 0; i < weights.length; i++) {
      this.processSample(weights[i], i);
    }
    const result = this.getSessionSummary();
    result.periods.forEach((period) => {
      const buffer = 10;
      const periodWeights = weights.slice(
        period.start + buffer,
        period.end + 1 - buffer,
      );
      if (periodWeights.length < 2) {
        period.variance = undefined;
        return;
      }
      const mean =
        periodWeights.reduce((sum, w) => sum + w, 0) / periodWeights.length;
      const variance =
        periodWeights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) /
        periodWeights.length;
      period.variance = Math.sqrt(variance);
    });
    return result;
  }

  private entryThreshold(): number {
    const minKnown = this.knownCatWeights.length
      ? this.knownCatWeights[0]
      : 0;
    const frac = minKnown
      ? Math.max(this.entryDeltaMin, minKnown * this.entryDeltaFrac)
      : this.entryDeltaMin;
    return frac;
  }

  private startSession(): void {
    this.sessionActive = true;
    this.sessionStartSample = this.currentSample;
    this.catWeight = 0;
    this.bestStableWeight = 0;
    this.bestStableDur = 0;
    this.exitBelowCnt = 0;
    this.gapCnt = 0;
    this.stableCnt = 0;
    this.transitions = [];
  }

  private transitionTo(newState: string, offset?: number): void {
    if (this.currentState !== newState) {
      if (this.sessionActive && newState === this.states.EMPTY) {
        this.currentState = newState;
        this.endSession();
        return;
      }
      this.transitions.push({
        from: this.currentState,
        to: newState,
        index: this.currentSample - (offset || 0),
      });
      this.currentState = newState;
    }
  }

  private nearKnownCatWeight(
    delta: number,
    tolFrac = this.knownPresenceTol,
  ): boolean {
    if (!this.knownCatWeights.length) return false;
    for (let i = 0; i < this.knownCatWeights.length; i++) {
      const w = this.knownCatWeights[i];
      if (w > 0 && Math.abs(delta - w) / w <= tolFrac) return true;
    }
    return false;
  }

  private confirmPresence(rel: number): boolean {
    return this.nearKnownCatWeight(rel) || rel > this.entryThreshold();
  }

  private endSession(): StateResult {
    this.sessionActive = false;
    this.transitionTo(this.states.ENDED);
    return this.getSessionSummary();
  }

  reset(): void {
    this.currentState = this.states.EMPTY;
    this.sessionActive = false;
    this.window = new Ring(10);
    this.weightHistory = new Ring(10);
    this.catWeight = 0;
    this.bestStableWeight = 0;
    this.bestStableDur = 0;
    this.exitBelowCnt = 0;
    this.gapCnt = 0;
    this.stableCnt = 0;
    this.transitions = [];
    this.wasteWeight = 0;
  }
}

const URINATION_VARIANCE_THRESHOLD_G = 4;

function determineEliminationType(
  periods: StatePeriod[],
): LitterboxUseEliminationType {
  const eliminatingPeriods = periods.filter(
    (p) => p.state === 'eliminating' && p.variance !== undefined,
  );
  if (eliminatingPeriods.length === 0) {
    return 'no_elimination';
  }
  const avgVariance =
    eliminatingPeriods.reduce((sum, p) => sum + (p.variance ?? 0), 0) /
    eliminatingPeriods.length;
  if (avgVariance < URINATION_VARIANCE_THRESHOLD_G) {
    return 'urination';
  }
  return 'defecation';
}

// --- LitterboxController ---

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
      const rawData = this.encodeRawData(
        session.startTime,
        measurements,
        contextData || undefined,
      );

      if (eliminationWeight < MAINTENANCE_THRESHOLD) {
        // Maintenance event
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

        let eliminationType: LitterboxUseEliminationType;
        if (eliminationWeight < NO_ELIMINATION_THRESHOLD) {
          eliminationType = 'no_elimination';
        } else {
          eliminationType = determineEliminationType(analysis.periods);
        }

        const event: NewEvent = {
          pet_id: petId,
          device_id: this.deviceId,
          timestamp: session.startTime,
          data: {
            type: 'litterbox_use',
            elimination_type: eliminationType,
            elimination_weight: Math.round(Math.max(0, eliminationWeight)),
            duration: Math.round(duration / 1000),
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

  private encodeRawData(
    startTime: Date,
    measurements: RawMeasurement[],
    context?: ContextData,
  ): Buffer {
    // Binary encoding format v1: [version:1byte][startTimestamp:8bytes][context:10bytes][count:4bytes][weights:count*2bytes]
    // Context format: [wasteWeight:2bytes][litterRemaining:2bytes][deepCleanTimer:1byte][totalVisits:1byte][daysSinceLitterReplaced:1byte][hoursSinceLastScoop:1byte][reserved:2bytes]
    const version = 1;
    const count = measurements.length;
    const buffer = Buffer.allocUnsafe(1 + 8 + 10 + 4 + count * 2);

    let offset = 0;
    buffer.writeUInt8(version, offset);
    offset += 1;

    buffer.writeBigUInt64BE(BigInt(startTime.getTime()), offset);
    offset += 8;

    // Context data (10 bytes total) - use max values to indicate null
    if (context) {
      // Waste weight: 0-2048g fits in uint16
      const wasteWeight = Math.min(
        65534,
        Math.max(0, Math.round(context.wasteWeight)),
      );
      buffer.writeUInt16BE(wasteWeight, offset);
      offset += 2;

      // Litter remaining: 0-50kg (50000g) fits in uint16
      const litterRemaining = Math.min(
        65534,
        Math.max(0, Math.round(context.litterRemaining)),
      );
      buffer.writeUInt16BE(litterRemaining, offset);
      offset += 2;

      // Deep clean timer: 0-255 hours fits in uint8
      const deepCleanTimer = Math.min(
        254,
        Math.max(0, Math.round(context.deepCleanTimer)),
      );
      buffer.writeUInt8(deepCleanTimer, offset);
      offset += 1;

      // Total visits: 0-255 fits in uint8
      const totalVisits = Math.min(
        254,
        Math.max(0, Math.round(context.totalVisits)),
      );
      buffer.writeUInt8(totalVisits, offset);
      offset += 1;

      // Days since litter replaced: 0-254 days fits in uint8
      const daysSinceLitterReplaced = Math.min(
        254,
        Math.max(0, Math.round(context.daysSinceLitterReplaced)),
      );
      buffer.writeUInt8(daysSinceLitterReplaced, offset);
      offset += 1;

      // Hours since last scoop: 0-254 hours fits in uint8
      const hoursSinceLastScoop = Math.min(
        254,
        Math.max(0, Math.round(context.hoursSinceLastScoop)),
      );
      buffer.writeUInt8(hoursSinceLastScoop, offset);
      offset += 1;
    } else {
      // No context - fill with max values (null indicators)
      buffer.writeUInt16BE(65535, offset); // wasteWeight null
      offset += 2;
      buffer.writeUInt16BE(65535, offset); // litterRemaining null
      offset += 2;
      buffer.writeUInt8(255, offset); // deepCleanTimer null
      offset += 1;
      buffer.writeUInt8(255, offset); // totalVisits null
      offset += 1;
      buffer.writeUInt8(255, offset); // daysSinceLitterReplaced null
      offset += 1;
      buffer.writeUInt8(255, offset); // hoursSinceLastScoop null
      offset += 1;
    }

    // Reserved space for future use
    buffer.writeUInt16BE(0, offset);
    offset += 2;

    buffer.writeUInt32BE(count, offset);
    offset += 4;

    // Store tared weights
    for (const measurement of measurements) {
      const weight = Math.round(measurement.weight);
      // Clamp to int16 range
      const clampedWeight = Math.max(-32768, Math.min(32767, weight));
      buffer.writeInt16BE(clampedWeight, offset);
      offset += 2;
    }

    return buffer;
  }

}
