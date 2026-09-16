import { sql, type Kysely } from 'kysely';
import {
  deriveLitterboxSampleRateHz,
  encodeLitterboxRawData,
  parseLitterboxUseEliminationType,
  type DecodedLitterboxVisitFrame,
  type LitterboxDeviceVerdict,
  type LitterboxMaintenanceEventTypeDTO,
  type LitterboxRawDataV2Context,
} from 'shared';

import type { Database } from '../../database/index.ts';
import { attributionColumns } from '../../domain/eventAttribution.ts';
import type { LitterboxUseEventData } from '../../domain/events.ts';
import type { EventBus } from '../devices/EventBus.ts';
import {
  getLatestPetWeightsGrams,
  isStraining,
  mergeAnalyzerIntoLitterboxData,
} from '../devices/providers/esphome/analyzeLitterboxUse.ts';
import { persistedLitterboxSegments } from '../devices/providers/esphome/persistedLitterboxSegments.ts';
import {
  StateAnalyzer,
  type StatePeriod,
} from '../devices/providers/esphome/StateAnalyzer.ts';
import { recordDeviceEvent } from '../events/recordDeviceEvent.ts';
import { getDepositsSinceScoop } from './depositsSinceScoop.ts';

/** A visit shorter than this is noise on the native path. */
const MIN_SESSION_MS = 10_000;
/** A native session that ends this far below zero was a scoop, not a cat. */
const MAINTENANCE_THRESHOLD_G = -20;
/**
 * How long a finished native session waits for the device's own record
 * before it is scored from the samples the native API delivered. The
 * device journals the record and ships it as soon as the broker takes it,
 * so a wait this long only ever runs out when MQTT is down.
 */
const DEFAULT_FRAME_WAIT_MS = 20_000;
/**
 * Device and server clocks both come from NTP, and a native session opens
 * on the same activity edge the device opens its event on; this covers
 * network latency and a second of clock skew when matching the two.
 */
const CLOCK_SLACK_MS = 30_000;
/** A continued record patches the visit it continues if it is this recent. */
const CONTINUATION_WINDOW_MS = 30 * 60_000;

/** The box's own counters, read off its live entities at visit end. */
export interface LitterboxLiveCounters {
  wasteWeightG?: number;
  litterRemainingG?: number;
  visitsSinceScoop?: number;
}

export interface LitterboxVisitTrackerDeps {
  db: Kysely<Database>;
  eventBus: EventBus;
  logger: Console;
  readCounters: () => LitterboxLiveCounters;
}

export interface LitterboxVisitTrackerOptions {
  frameWaitMs?: number;
}

interface NativeSession {
  startTime: Date;
  endTime?: Date;
  weightsG: number[];
  sampleAtMs: number[];
  /** A device record covering this session arrived; no native scoring. */
  servedByFrame: boolean;
}

export type FrameOutcome =
  | 'recorded_visit'
  | 'recorded_maintenance'
  | 'attached_to_existing'
  | 'patched_continued'
  | 'duplicate'
  | 'nothing_to_record'
  | 'unusable';

const MAINTENANCE_KINDS: Record<string, LitterboxMaintenanceEventTypeDTO> = {
  scoop: 'scoop',
  deep_clean: 'deep_clean',
  top_up: 'litter_addition',
};

/**
 * Turns what a litterbox reports into visit and maintenance events.
 *
 * Two sources feed it. The native API delivers an activity edge and the raw
 * weight stream, which is the fallback. The device's own visit record (the
 * `LBV1` frame it publishes over MQTT) is preferred: it carries every
 * sample the device's analyzer consumed, at the device's cadence, plus the
 * verdict it reached. A native session therefore waits a little for the
 * frame before scoring itself, and a frame that turns up after the native
 * scoring attaches itself to that event instead of making a second one.
 * The server's `StateAnalyzer` scores every visit either way; the device's
 * verdict is kept beside it as `device_verdict` until the two agree
 * (summaries/mqtt-integration-plan.md §7).
 */
export class LitterboxVisitTracker {
  private session: NativeSession | null = null;
  private pending: { session: NativeSession; timer: NodeJS.Timeout } | null =
    null;
  /**
   * Writes run one at a time: a record arriving while the native scoring
   * it should have pre-empted is mid-insert must find that event, not
   * race it into a second one.
   */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly frameWaitMs: number;
  private readonly deviceId: number;
  private readonly deps: LitterboxVisitTrackerDeps;

  constructor(
    deviceId: number,
    deps: LitterboxVisitTrackerDeps,
    options: LitterboxVisitTrackerOptions = {},
  ) {
    this.deviceId = deviceId;
    this.deps = deps;
    this.frameWaitMs = options.frameWaitMs ?? DEFAULT_FRAME_WAIT_MS;
  }

  get active(): boolean {
    return this.session !== null;
  }

  activityChanged(active: boolean, at: Date = new Date()): void {
    if (active && !this.session) {
      this.deps.logger.log(`[Litterbox ${this.deviceId}] session start`);
      this.deps.eventBus.publish('device.activity.start', {
        deviceId: this.deviceId,
        timestamp: at,
      });
      this.session = {
        startTime: at,
        weightsG: [],
        sampleAtMs: [],
        servedByFrame: false,
      };
    } else if (!active && this.session) {
      const session = this.session;
      this.session = null;
      session.endTime = at;
      this.deps.eventBus.publish('device.activity.end', {
        deviceId: this.deviceId,
        timestamp: at,
      });
      if (session.servedByFrame) return;
      this.cancelPending();
      this.pending = {
        session,
        timer: setTimeout(() => {
          this.pending = null;
          void this.serialized(() => this.recordNativeSession(session));
        }, this.frameWaitMs),
      };
    }
  }

  sample(weightG: number, at: Date = new Date()): void {
    if (!this.session) return;
    this.session.weightsG.push(weightG);
    this.session.sampleAtMs.push(at.getTime());
  }

  dispose(): void {
    this.cancelPending();
    this.session = null;
  }

  private cancelPending(): void {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending = null;
    }
  }

  /**
   * Whether a device record covers a native session. When the device clock
   * is valid its window is compared to the session's; otherwise the record
   * is taken to be the one for whichever session is open or waiting, since
   * the device ships in order and the wait is short.
   */
  private frameCovers(
    frame: DecodedLitterboxVisitFrame,
    session: NativeSession,
  ): boolean {
    const { trailer } = frame;
    if (!trailer.clock_valid) return true;
    const frameStart = trailer.id * 1000;
    const frameEnd = trailer.ended * 1000;
    const sessionStart = session.startTime.getTime();
    const sessionEnd = session.endTime?.getTime() ?? Date.now();
    return (
      frameStart <= sessionEnd + CLOCK_SLACK_MS &&
      frameEnd >= sessionStart - CLOCK_SLACK_MS
    );
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => {});
    return run;
  }

  ingestFrame(
    frame: DecodedLitterboxVisitFrame,
    frameBytes: Uint8Array,
    receivedAt: Date = new Date(),
  ): Promise<FrameOutcome> {
    if (this.session && this.frameCovers(frame, this.session)) {
      this.session.servedByFrame = true;
    }
    if (this.pending && this.frameCovers(frame, this.pending.session)) {
      this.cancelPending();
    }
    return this.serialized(() =>
      this.storeFrame(frame, frameBytes, receivedAt),
    );
  }

  private async storeFrame(
    frame: DecodedLitterboxVisitFrame,
    frameBytes: Uint8Array,
    receivedAt: Date,
  ): Promise<FrameOutcome> {
    const { trailer } = frame;
    const startTime = trailer.clock_valid
      ? new Date(trailer.id * 1000)
      : new Date(receivedAt.getTime() - trailer.duration * 1000);
    const log = (message: string) =>
      this.deps.logger.log(
        `[Litterbox ${this.deviceId}] record ${trailer.id}: ${message}`,
      );

    if (frame.weights.length === 0) {
      log('no samples');
      return 'unusable';
    }

    if (trailer.continued) {
      return this.patchContinuedVisit(frame, startTime, log);
    }

    const existing = await this.findEventNear(startTime);
    const lastWeightG = frame.weights[frame.weights.length - 1];
    const rawData = async () =>
      Buffer.from(
        encodeLitterboxRawData({
          version: 3,
          startTimeMs: startTime.getTime(),
          context: await this.getContextData(startTime),
          frame: frameBytes,
        }),
      );

    const maintenanceType = MAINTENANCE_KINDS[trailer.box.kind];
    if (maintenanceType) {
      if (existing) {
        log(`${trailer.box.kind} already recorded as event ${existing.id}`);
        return 'duplicate';
      }
      await recordDeviceEvent(this.deps, {
        deviceId: this.deviceId,
        timestamp: startTime,
        data: {
          type: 'litterbox_maintenance',
          maintenance_type: maintenanceType,
          ...(maintenanceType === 'litter_addition'
            ? { litter_amount: Math.round(trailer.box.added) }
            : {}),
        },
        raw_data: await rawData(),
        human_verified: false,
      });
      log(`recorded ${maintenanceType}`);
      return 'recorded_maintenance';
    }

    if (!trailer.visit) {
      log(`nothing to record (${trailer.box.kind}, visit null)`);
      return 'nothing_to_record';
    }

    const deviceVerdict = deviceVerdictOf(frame);
    if (existing) {
      if (existing.data.type !== 'litterbox_use') {
        log(`window already holds ${existing.data.type} ${existing.id}`);
        return 'duplicate';
      }
      if (existing.data.device_verdict) {
        log(`already recorded as event ${existing.id}`);
        return 'duplicate';
      }
      await this.deps.db
        .updateTable('event')
        .set({
          data: { ...existing.data, device_verdict: deviceVerdict },
          raw_data: await rawData(),
        })
        .where('id', '=', existing.id)
        .execute();
      log(`attached to natively scored event ${existing.id}`);
      return 'attached_to_existing';
    }

    // A cat still on the scale when the device closed its event leaves the
    // waste unknown until the record that continues this one arrives.
    const catInsideG = smallestCatWeightG(trailer.config.cat_weights);
    const catInside = catInsideG !== null && lastWeightG > 0.5 * catInsideG;
    const sampleRateHz = deriveLitterboxSampleRateHz(frame);

    await this.recordVisit({
      startTime,
      durationS: trailer.duration,
      weightsG: frame.weights,
      eliminationWeightG: catInside ? 0 : lastWeightG,
      sampleRateHz,
      rawData: await rawData(),
      deviceVerdict,
    });
    log(
      `recorded visit${catInside ? ' (cat still inside, waste pending)' : ''}`,
    );
    return 'recorded_visit';
  }

  /**
   * The device does not move its tare while a cat sits through its timeout,
   * so the continuing record's final weight is the waste of the whole
   * visit; it replaces the placeholder on the visit it continues.
   */
  private async patchContinuedVisit(
    frame: DecodedLitterboxVisitFrame,
    startTime: Date,
    log: (message: string) => void,
  ): Promise<FrameOutcome> {
    const previous = await this.deps.db
      .selectFrom('event')
      .select(['id', 'data'])
      .where('device_id', '=', this.deviceId)
      .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_use')
      .where(sql<boolean>`json_extract(data, '$.device_verdict') is not null`)
      .where(
        'timestamp',
        '>=',
        new Date(startTime.getTime() - CONTINUATION_WINDOW_MS),
      )
      .where('timestamp', '<=', startTime)
      .orderBy('timestamp', 'desc')
      .executeTakeFirst();
    if (!previous || previous.data.type !== 'litterbox_use') {
      log('continues a visit that was never recorded');
      return 'nothing_to_record';
    }
    const lastWeightG = frame.weights[frame.weights.length - 1];
    const eliminationWeight = Math.round(Math.max(0, lastWeightG));
    const data: LitterboxUseEventData = {
      ...previous.data,
      elimination_weight: eliminationWeight,
    };
    await this.deps.db
      .updateTable('event')
      .set({
        data: mergeStrainingInto(data),
      })
      .where('id', '=', previous.id)
      .execute();
    log(`waste ${eliminationWeight} g patched onto event ${previous.id}`);
    return 'patched_continued';
  }

  private async findEventNear(at: Date) {
    return this.deps.db
      .selectFrom('event')
      .select(['id', 'data'])
      .where('device_id', '=', this.deviceId)
      .where(sql`json_extract(data, '$.type')`, 'in', [
        'litterbox_use',
        'litterbox_maintenance',
      ])
      .where('timestamp', '>=', new Date(at.getTime() - CLOCK_SLACK_MS))
      .where('timestamp', '<=', new Date(at.getTime() + CLOCK_SLACK_MS))
      .orderBy('timestamp', 'asc')
      .executeTakeFirst();
  }

  private async recordNativeSession(session: NativeSession): Promise<void> {
    try {
      if (!session.endTime) return;
      const durationMs =
        session.endTime.getTime() - session.startTime.getTime();
      const count = session.weightsG.length;
      this.deps.logger.log(
        `[Litterbox ${this.deviceId}] scoring native session: ${durationMs} ms, ${count} samples`,
      );
      if (durationMs < MIN_SESSION_MS) {
        this.deps.logger.log(
          `[Litterbox ${this.deviceId}] ignoring short session (${durationMs} ms)`,
        );
        return;
      }
      if (count === 0) {
        this.deps.logger.log(
          `[Litterbox ${this.deviceId}] no samples collected during session`,
        );
        return;
      }

      const eliminationWeightG = session.weightsG[count - 1];
      const startTimeMs = session.startTime.getTime();
      const sampleOffsetsMs = session.sampleAtMs.map((t) => t - startTimeMs);
      const context = await this.getContextData(session.startTime);
      const rawData = Buffer.from(
        encodeLitterboxRawData({
          version: 2,
          startTimeMs,
          context,
          weights: session.weightsG,
          sampleOffsetsMs,
        }),
      );
      const sampleRateHz = deriveLitterboxSampleRateHz({
        weights: session.weightsG,
        sampleOffsetsMs,
      });

      if (eliminationWeightG < MAINTENANCE_THRESHOLD_G) {
        await recordDeviceEvent(this.deps, {
          deviceId: this.deviceId,
          timestamp: session.startTime,
          data: { type: 'litterbox_maintenance', maintenance_type: 'scoop' },
          raw_data: rawData,
          human_verified: false,
        });
        this.deps.logger.log(
          `[Litterbox ${this.deviceId}] recorded scoop (${eliminationWeightG} g)`,
        );
        return;
      }

      await this.recordVisit({
        startTime: session.startTime,
        durationS: Math.round(durationMs / 1000),
        weightsG: session.weightsG,
        eliminationWeightG,
        sampleRateHz,
        rawData,
      });
    } catch (error) {
      this.deps.logger.error(
        `[Litterbox ${this.deviceId}] error scoring session:`,
        error,
      );
    }
  }

  private async recordVisit(visit: {
    startTime: Date;
    durationS: number;
    weightsG: number[];
    eliminationWeightG: number;
    sampleRateHz: number;
    rawData: Buffer;
    deviceVerdict?: LitterboxDeviceVerdict;
  }): Promise<number> {
    const latestPetWeights = await getLatestPetWeightsGrams(
      this.deps.db,
      visit.startTime,
    );
    const knownWeights = Array.from(latestPetWeights.values()).sort(
      (a, b) => a - b,
    );
    const petIdsByWeight = new Map<number, number>();
    for (const [petId, weight] of latestPetWeights) {
      petIdsByWeight.set(weight, petId);
    }

    const analyzer = new StateAnalyzer(knownWeights, visit.sampleRateHz);
    const analysis = analyzer.processEvent(visit.weightsG);

    let petId: number | null = null;
    if (
      analysis.detectedCatIndex >= 0 &&
      analysis.detectedCatIndex < knownWeights.length
    ) {
      petId =
        petIdsByWeight.get(knownWeights[analysis.detectedCatIndex]) ?? null;
    }
    this.deps.logger.log(
      `[Litterbox ${this.deviceId}] pet ${petId ?? 'unknown'} (index=${analysis.detectedCatIndex}, presence=${JSON.stringify(analysis.catPresence)})`,
    );

    const data = mergeAnalyzerIntoLitterboxData(
      {
        type: 'litterbox_use',
        elimination_type: 'unknown',
        elimination_weight: Math.round(Math.max(0, visit.eliminationWeightG)),
        duration: visit.durationS,
        ...(visit.deviceVerdict ? { device_verdict: visit.deviceVerdict } : {}),
      },
      analysis,
      visit.sampleRateHz,
    );

    const eventId = await recordDeviceEvent(this.deps, {
      deviceId: this.deviceId,
      timestamp: visit.startTime,
      data,
      pet_id: petId,
      // The load cell matched a known cat's weight; that is the whole basis.
      attributed_by: 'weight',
      raw_data: visit.rawData,
      human_verified: false,
    });

    if (petId !== null && analysis.catWeight > 0) {
      await this.deps.db
        .insertInto('event')
        .values({
          parent_event_id: eventId,
          ...attributionColumns('pet', petId, 'weight'),
          device_id: this.deviceId,
          timestamp: visit.startTime,
          data: {
            type: 'weight_measurement',
            weight: Math.round(analysis.catWeight),
          },
          raw_data: null,
          human_verified: false,
        })
        .execute();
    }
    return eventId;
  }

  /**
   * The box reports total waste but not how it accumulated. The pip display
   * and the deposit count are attached later from the event log, by
   * `getDepositsSinceScoop`. Captured at visit start so the counters
   * describe the box at entry and stay immune to later event edits.
   */
  private async getContextData(
    sessionStart: Date,
  ): Promise<LitterboxRawDataV2Context> {
    const counters = this.deps.readCounters();

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
      wasteWeight: counters.wasteWeightG,
      litterRemaining: counters.litterRemainingG,
      daysSinceDeepClean,
      visitsSinceScoop: counters.visitsSinceScoop,
      urinationsSinceScoop,
      defecationsSinceScoop,
    };
  }
}

/** Smallest configured cat, in grams; null when the device knows no cats. */
function smallestCatWeightG(catWeightsKg: number[]): number | null {
  const known = catWeightsKg.filter((kg) => kg > 0);
  return known.length ? Math.min(...known) * 1000 : null;
}

/** The device's periods carry a std dev; a negative one means not measured. */
function devicePeriods(frame: DecodedLitterboxVisitFrame): StatePeriod[] {
  const periods = frame.trailer.visit?.periods ?? [];
  return periods.map(([state, start, end, stdDev]) => ({
    state,
    start,
    end,
    ...(stdDev >= 0 ? { variance: stdDev } : {}),
  }));
}

export function deviceVerdictOf(
  frame: DecodedLitterboxVisitFrame,
): LitterboxDeviceVerdict {
  const { trailer } = frame;
  const visit = trailer.visit;
  return {
    visit_id: trailer.id,
    elimination_type:
      parseLitterboxUseEliminationType(visit?.type) ?? 'unknown',
    cat_index: visit?.cat ?? -1,
    cat_weight: Math.round(visit?.cat_weight ?? 0),
    waste_weight: Math.round(visit?.waste_weight ?? 0),
    segments: persistedLitterboxSegments(devicePeriods(frame)),
    firmware: `${trailer.fw.project} ${trailer.fw.version}`,
  };
}

/** Straining is judged against the waste, so it follows a patched weight. */
function mergeStrainingInto(
  data: LitterboxUseEventData,
): LitterboxUseEventData {
  if (data.straining === undefined) return data;
  return {
    ...data,
    straining: isStraining(data.elimination_type, data.elimination_weight),
  };
}
