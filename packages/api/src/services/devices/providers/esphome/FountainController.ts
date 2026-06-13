import { type Entity as EspHomeEntity } from 'esphome-client';
import sharp from 'sharp';
import type { WaterFountainState } from 'shared';
import type { Camera, ProviderDeps, Device } from '../../types.ts';
import type { PendingMedia } from '../../../media/MediaManager.ts';
import type {
  NewEvent,
  WaterIntakeEventData,
} from '../../../../database/types/EventTable.ts';
import { recordDeviceEvent } from '../../../events/recordDeviceEvent.ts';
import {
  BaseESPHomeController,
  type ReconnectConfig,
} from './BaseESPHomeController.ts';

const DRINKING_RATE_MIN_ML_PER_MIN = 10;
const DRINKING_RATE_MAX_ML_PER_MIN = 90;
const EMA_SPAN = 10;          // ~1s at 10 Hz; alpha = 2/(span+1) ≈ 0.18
const RATE_HALF_WINDOW = 5;   // ±5 samples → ~1s centered rate-estimation window
const MIN_DRINKING_DURATION_SAMPLES = 10; // min contiguous in-band samples (~1s) to count as drinking

const SENSORS = {
  ACTIVITY: 'activity',
  PUMP_STATUS: 'pump_status',
  WATER_LEVEL: 'water_level',
  LAST_DRINK_AMOUNT: 'last_drink_amount',
  LAST_DRINK_DURATION: 'last_drink_duration',
  UNFILTERED_WEIGHT: 'unfiltered_weight',
  // Optional sensors for fountain-specific features
  WATER_CHANGE_DAYS_REMAINING: 'water_change_days_remaining',
  FILTER_CHANGE_DAYS_REMAINING: 'filter_change_days_remaining',
} as const;

interface RawMeasurement {
  timestamp: Date;
  weight: number; // grams
}

interface WaterSession {
  startTime: Date;
  endTime?: Date;
  measurements: RawMeasurement[];
}

interface DrinkingAnalysis {
  amount: number;         // ml of valid drinking (rate-filtered)
  duration: number;       // seconds of valid drinking
  rawAmount: number;      // total weight drop across session
  excludedAmount: number; // weight drop excluded by rate filter
  filtered: boolean; // true if any segments were excluded
}

/** Merge device-reported aggregates with server-side segment analysis for persistence. */
function buildPersistedDrinkMetrics(options: {
  deviceAmount: number;
  deviceDuration: number;
  analysis: DrinkingAnalysis;
  sessionStart: Date;
  sessionEnd: Date;
}): { amount: number; duration: number; raw_amount: number } {
  const { deviceAmount, deviceDuration, analysis, sessionStart, sessionEnd } =
    options;

  const raw_amount =
    deviceAmount > analysis.rawAmount
      ? Math.round(deviceAmount)
      : analysis.rawAmount;

  const amount =
    deviceAmount > 0
      ? Math.max(0, Math.round(deviceAmount - analysis.excludedAmount))
      : analysis.amount;

  const wallClockDuration = Math.round(
    (sessionEnd.getTime() - sessionStart.getTime()) / 1000,
  );
  const duration = deviceDuration > 0 ? deviceDuration : wallClockDuration;

  return { amount, duration, raw_amount };
}

/**
 * Classifies each ~100ms inter-sample interval individually by estimating
 * its flow rate from a centered ±RATE_HALF_WINDOW span. This gives ~100ms
 * resolution on spill/drink boundaries instead of the 1-second boundary
 * artifacts of fixed buckets.
 *
 * Algorithm:
 *  1. EMA-smooth the raw weight series (alpha = 2/(EMA_SPAN+1)).
 *  2. At every sample i, compute a rate estimate from the wider
 *     ±RATE_HALF_WINDOW span — enough span to stabilise noise while keeping
 *     the estimate local.
 *  3. Classify each interval as in-band (drinking candidate), spill, or noise.
 *  4. Group consecutive in-band intervals into runs; only runs lasting
 *     ≥ MIN_DRINKING_DURATION_SAMPLES count as valid drinking (shorter runs
 *     are treated as noise to reject brief splashes).
 *  5. Sum drops and durations from confirmed drinking runs only.
 */
function analyzeDrinkingSegments(measurements: RawMeasurement[]): DrinkingAnalysis {
  if (measurements.length < 2) {
    return { amount: 0, duration: 0, rawAmount: 0, excludedAmount: 0, filtered: false };
  }

  const n = measurements.length;

  // Step 1: EMA smooth
  const alpha = 2 / (EMA_SPAN + 1);
  const smoothed: number[] = new Array(n);
  smoothed[0] = measurements[0].weight;
  for (let i = 1; i < n; i++) {
    smoothed[i] = alpha * measurements[i].weight + (1 - alpha) * smoothed[i - 1];
  }

  // Step 2: Per-sample rate estimate — centered ±RATE_HALF_WINDOW span (~1s at 10Hz)
  const rates = measurements.map((_, i) => {
    const lo = Math.max(0, i - RATE_HALF_WINDOW);
    const hi = Math.min(n - 1, i + RATE_HALF_WINDOW);
    const dtMs =
      measurements[hi].timestamp.getTime() - measurements[lo].timestamp.getTime();
    if (dtMs <= 0) return 0;
    return ((smoothed[lo] - smoothed[hi]) / dtMs) * 60_000; // ml/min, positive = consumption
  });

  // Step 3: Classify each interval by its average endpoint rate
  type IntervalClass = 'drinking' | 'other';
  const intervalClass: IntervalClass[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const intervalRate = (rates[i] + rates[i + 1]) / 2;
    intervalClass[i] =
      intervalRate >= DRINKING_RATE_MIN_ML_PER_MIN &&
      intervalRate <= DRINKING_RATE_MAX_ML_PER_MIN
        ? 'drinking'
        : 'other';
  }

  // Step 4: Group consecutive in-band intervals into runs; accept only those
  // lasting ≥ MIN_DRINKING_DURATION_SAMPLES (rejects brief splashes/glitches).
  const validIntervals = new Uint8Array(n - 1); // 1 = confirmed drinking
  let runStart = -1;
  for (let i = 0; i <= n - 1; i++) {
    const inBand = i < n - 1 && intervalClass[i] === 'drinking';
    if (inBand && runStart === -1) {
      runStart = i;
    } else if (!inBand && runStart !== -1) {
      const runLen = i - runStart;
      if (runLen >= MIN_DRINKING_DURATION_SAMPLES) {
        for (let j = runStart; j < i; j++) validIntervals[j] = 1;
      }
      runStart = -1;
    }
  }

  // Step 5: Accumulate from confirmed drinking intervals only
  let validAmount = 0;
  let validDurationMs = 0;
  let hasExclusions = false;

  for (let i = 0; i < n - 1; i++) {
    const dtMs =
      measurements[i + 1].timestamp.getTime() - measurements[i].timestamp.getTime();
    if (dtMs <= 0) continue;

    const drop = smoothed[i] - smoothed[i + 1];
    if (drop <= 0) continue;

    if (validIntervals[i]) {
      validAmount += drop;
      validDurationMs += dtMs;
    } else {
      hasExclusions = true;
    }
  }

  // Net weight drop for the session as the raw amount.
  const rawAmount = Math.max(0, smoothed[0] - smoothed[n - 1]);

  return {
    amount: Math.round(Math.max(0, validAmount)),
    duration: Math.round(validDurationMs / 1000),
    rawAmount: Math.round(rawAmount),
    excludedAmount: Math.round(Math.max(0, rawAmount - validAmount)),
    filtered: hasExclusions,
  };
}

export class FountainController
  extends BaseESPHomeController
  implements Camera {
  private currentEvent: NewEvent<WaterIntakeEventData> | null = null;
  private currentSession: WaterSession | null = null;
  private state: WaterFountainState = {
    waterLevel: 0,
  };
  private snapshotCaptureChain: Promise<Buffer | undefined> = Promise.resolve(undefined);
  private version = 1;

  constructor(device: Device, deps: ProviderDeps) {
    super(device, deps);
  }

  protected get deviceTypeName(): string {
    return 'fountain';
  }

  protected get reconnectConfig(): ReconnectConfig {
    return {
      baseDelay: 1000,
      maxDelay: 5000,
      heartbeatTimeout: 3000,
      pingInterval: 1000,
      connectHandshakeTimeout: 12000,
    };
  }

  protected onConnected(): void {
    // No additional setup needed on connect
  }

  protected onEntitiesReceived(entities: EspHomeEntity[]): void {
    // Detect camera entities
    for (const entity of entities) {
      if ('type' in entity && entity.type === 'camera') {
        this.state.hasCamera = true;
        console.log(`Detected camera in ${this.device.name}`);
      }
    }

    // Detect fountain-specific features and initialize state for sensors that exist
    const pumpStatusKey = this.getEntityKey(SENSORS.PUMP_STATUS);
    if (pumpStatusKey !== null) {
      this.state.pumpStatus = 'ok';
      console.log(`Detected pump_status sensor in ${this.device.name}`);
    }

    const waterDaysKey = this.getEntityKey(SENSORS.WATER_CHANGE_DAYS_REMAINING);
    if (waterDaysKey !== null) {
      this.state.waterDaysRemaining = 0;
      console.log(`Detected water_change_days_remaining sensor in ${this.device.name}`);
    }

    const filterDaysKey = this.getEntityKey(SENSORS.FILTER_CHANGE_DAYS_REMAINING);
    if (filterDaysKey !== null) {
      this.state.filterDaysRemaining = 0;
      console.log(`Detected filter_change_days_remaining sensor in ${this.device.name}`);
    }
  }

  protected handleSensorUpdate(key: number, state: unknown): void {
    const waterLevelKey = this.getEntityKey(SENSORS.WATER_LEVEL);
    if (waterLevelKey !== null && key === waterLevelKey) {
      this.state.waterLevel = Math.round(state as number);
      return;
    }

    // Handle pump status (optional entity - some fountains don't have it)
    const pumpStatusKey = this.getEntityKey(SENSORS.PUMP_STATUS);
    if (pumpStatusKey !== null && key === pumpStatusKey) {
      this.state.pumpStatus = state ? 'error' : 'ok';
      return;
    }

    // Handle water change days remaining (optional)
    const waterDaysKey = this.getEntityKey(SENSORS.WATER_CHANGE_DAYS_REMAINING);
    if (waterDaysKey !== null && key === waterDaysKey) {
      this.state.waterDaysRemaining = Math.round(state as number);
      return;
    }

    // Handle filter change days remaining (optional)
    const filterDaysKey = this.getEntityKey(SENSORS.FILTER_CHANGE_DAYS_REMAINING);
    if (filterDaysKey !== null && key === filterDaysKey) {
      this.state.filterDaysRemaining = Math.round(state as number);
      return;
    }

    // Collect raw weight samples into the active session (10Hz HX711 stream)
    if (this.currentSession) {
      const unfilteredWeightKey = this.getEntityKey(SENSORS.UNFILTERED_WEIGHT);
      if (
        unfilteredWeightKey !== null &&
        key === unfilteredWeightKey &&
        typeof state === 'number'
      ) {
        this.currentSession.measurements.push({
          timestamp: new Date(),
          weight: state, // ESPHome sensor is already in grams
        });
        return;
      }
    }

    // Capture drink data from ESPHome aggregates as fallback
    if (this.currentEvent && state) {
      const drinkAmountKey = this.getEntityKey(SENSORS.LAST_DRINK_AMOUNT);
      const drinkDurationKey = this.getEntityKey(SENSORS.LAST_DRINK_DURATION);
      if (drinkAmountKey !== null && key === drinkAmountKey) {
        console.log(`Last drink amount updated: ${state}ml`);
        this.currentEvent.data.amount = Math.round(state as number);
      }
      if (drinkDurationKey !== null && key === drinkDurationKey) {
        console.log(`Last drink duration updated: ${state}s`);
        this.currentEvent.data.duration = Math.round(state as number);
      }
    }
  }

  protected setupListeners() {
    super.setupListeners();

    // Override binary_sensor handler to add activity tracking
    this.client.on('binary_sensor', async (data) => {
      const { key, state } = data;
      this.sensorValues.set(key, state);
      this.handleSensorUpdate(key, state);

      // Handle activity sensor for water intake events
      const activityKey = this.getEntityKey(SENSORS.ACTIVITY);
      if (activityKey !== null && key === activityKey) {
        if (state === true) {
          const date = new Date();
          this.deps.eventBus.publish('device.activity.start', {
            deviceId: this.deviceId,
            timestamp: date,
          });

          this.currentSession = { startTime: date, measurements: [] };

          this.currentEvent = {
            data: {
              type: 'water_intake',
              amount: 0,
              duration: 0,
            },
            timestamp: date,
            human_verified: false,
            pet_id: null,
            device_id: this.deviceId,
            raw_data: null,
          };
        } else {
          // Activity just ended — close the session
          console.log('Activity ended.');

          const activityEndTime = new Date();

          this.deps.eventBus.publish('device.activity.end', {
            deviceId: this.deviceId,
            timestamp: activityEndTime,
          });

          if (this.currentSession) {
            this.currentSession.endTime = activityEndTime;
          }

          const session = this.currentSession;
          this.currentSession = null;

          if (session && session.measurements.length >= 2) {
            // Enough raw data for segment-level rate analysis
            console.log(
              `[Fountain] Processing session with ${session.measurements.length} raw samples`,
            );
            const analysis = analyzeDrinkingSegments(session.measurements);
            const rawData = this.encodeWaterRawData(session.startTime, session.measurements);

            console.log(
              `[Fountain] Drinking analysis: ${analysis.amount}ml valid, ` +
              `${analysis.excludedAmount}ml excluded, ${analysis.rawAmount}ml raw, ` +
              `${analysis.duration}s filtered-duration, filtered=${analysis.filtered}`,
            );

            if (this.currentEvent) {
              const eventToSave = this.currentEvent;
              this.currentEvent = null;

              // Device-reported values captured via handleSensorUpdate before activity ended.
              // The device uses a 5s pre-activity rolling baseline so it knows the water level
              // before the activity sensor fires — giving it a more complete picture than the
              // server, which only starts collecting samples after the activity signal arrives.
              const deviceAmount = eventToSave.data.amount; // 0 if sensor update not received
              const deviceDuration = eventToSave.data.duration ?? 0; // 0 if sensor update not received

              const metrics = buildPersistedDrinkMetrics({
                deviceAmount,
                deviceDuration,
                analysis,
                sessionStart: session.startTime,
                sessionEnd: session.endTime!,
              });

              eventToSave.data.amount = metrics.amount;
              eventToSave.data.duration = metrics.duration;
              eventToSave.data.raw_amount = metrics.raw_amount;
              eventToSave.data.excluded_amount = analysis.excludedAmount;
              eventToSave.data.filtered = analysis.filtered;
              eventToSave.raw_data = rawData;

              if (this.shouldPersistDrinkEvent(eventToSave.data)) {
                this.saveDrinkEvent(eventToSave);
              } else {
                console.log(
                  `[Fountain] Skipping analyzed water_intake event with non-positive metrics: ` +
                  `amount=${eventToSave.data.amount}ml, duration=${eventToSave.data.duration}s`,
                );
              }
            }
          } else {
            // No raw stream available — fall back to ESPHome aggregates
            console.log(
              '[Fountain] No raw weight samples, falling back to last_drink_amount/duration',
            );

            if (
              this.currentEvent &&
              this.shouldPersistDrinkEvent(this.currentEvent.data)
            ) {
              console.log('Drink data already captured, saving immediately.');
              const eventToSave = this.currentEvent;
              this.currentEvent = null;
              this.saveDrinkEvent(eventToSave);
            } else {
              console.log('Waiting for drink data...');
              this.captureNextDrinkData();
            }
          }
        }
      }
    });
  }

  private captureNextDrinkData() {
    if (!this.currentEvent) {
      console.warn('No active drink event to capture data for.');
      return;
    }

    const drinkAmountKey = this.getEntityKey(SENSORS.LAST_DRINK_AMOUNT);
    const drinkDurationKey = this.getEntityKey(SENSORS.LAST_DRINK_DURATION);

    const onSensorUpdate = (event: { key: number; state?: number }) => {
      console.debug('Sensor update during drink event:', event);
      const { data } = this.currentEvent!;

      if (drinkAmountKey !== null && event.key === drinkAmountKey && event.state != null) {
        data.amount = Math.round(event.state);
      } else if (
        drinkDurationKey !== null &&
        event.key === drinkDurationKey &&
        event.state != null
      ) {
        data.duration = Math.round(event.state);
      }

      // Once both values are captured, save them
      if (!!this.currentEvent && this.shouldPersistDrinkEvent(data)) {
        this.saveDrinkEvent(this.currentEvent);
        this.client.off('sensor', onSensorUpdate);
        this.currentEvent = null;
      }
    };

    this.client.on('sensor', onSensorUpdate);

    setTimeout(async () => {
      if (this.currentEvent) {
        console.warn('Timed out waiting for drink data.');
        this.client.off('sensor', onSensorUpdate);

        this.currentEvent = null;
      }
    }, 1000);
  }

  private async saveDrinkEvent(event: NewEvent<WaterIntakeEventData>) {
    const eventData = event.data;
    const eventTimestamp = event.timestamp;

    console.log('--- SAVING DRINK EVENT ---');
    console.log(`Device: ${this.device.name}`);
    console.log(`Amount: ${eventData.amount}ml`);
    if (eventData.raw_amount != null) {
      console.log(`Raw amount: ${eventData.raw_amount}ml (device-corrected)`);
      console.log(`Excluded: ${eventData.excluded_amount}ml (rate-filtered)`);
    }
    console.log(`Duration: ${eventData.duration}s (device-reported)`);
    console.log('--------------------------');

    try {
      await recordDeviceEvent(this.deps, {
        deviceId: this.deviceId,
        timestamp: eventTimestamp,
        data: eventData,
        pet_id: event.pet_id,
        raw_data: event.raw_data,
        human_verified: event.human_verified,
      });
      console.log('Drink event inserted into DB.');
    } catch (err) {
      console.error('Failed to insert drink event:', err);
    }
  }

  private shouldPersistDrinkEvent(data: WaterIntakeEventData): boolean {
    const amount = data.amount ?? 0;
    const duration = data.duration ?? 0;

    return (
      Number.isFinite(amount) &&
      Number.isFinite(duration) &&
      amount > 0 &&
      duration > 0
    );
  }

  /**
   * Encodes raw HX711 weight measurements into a compact binary buffer.
   *
   * Format v2:
   *   [version:1]   uint8  — 2
   *   [startTs:8]   uint64 BE — ms since epoch
   *   [context:4]   bytes  — [waterLevel:1 (0-100, 255=null)][reserved:3]
   *   [count:4]     uint32 BE — number of samples
   *   [weights:N*4] int32 BE each — centgrams (grams × 100), 0.01 g resolution
   */
  private encodeWaterRawData(
    startTime: Date,
    measurements: RawMeasurement[],
  ): Buffer {
    const count = measurements.length;
    const buf = Buffer.allocUnsafe(1 + 8 + 4 + 4 + count * 4);

    let off = 0;

    buf.writeUInt8(this.version, off); off += 1;
    buf.writeBigUInt64BE(BigInt(startTime.getTime()), off); off += 8;

    // Context: water level percent (0-100), 255 = unknown
    const waterLevelKey = this.getEntityKey(SENSORS.WATER_LEVEL);
    const waterLevel =
      waterLevelKey !== null
        ? Math.min(100, Math.max(0, Math.round(this.sensorValues.get(waterLevelKey) as number ?? 255)))
        : 255;
    buf.writeUInt8(waterLevel, off); off += 1;
    buf.writeUInt8(0, off); off += 1; // reserved
    buf.writeUInt16BE(0, off); off += 2; // reserved

    buf.writeUInt32BE(count, off); off += 4;

    for (const m of measurements) {
      // Store as centgrams (×100) in int32 — 0.01 g resolution, range ±21 Mg
      buf.writeInt32BE(Math.round(m.weight * 100), off); off += 4;
    }

    return buf;
  }

  async getSnapshotBuffer(): Promise<Buffer | undefined> {
    if (!this.state.hasCamera) {
      return undefined;
    }

    const next = this.snapshotCaptureChain.then(() =>
      this.requestSnapshotBuffer(),
    );
    this.snapshotCaptureChain = next.catch(() => undefined);
    return next;
  }

  private requestSnapshotBuffer(): Promise<Buffer | undefined> {
    return new Promise<Buffer | undefined>((resolve) => {
      const timeout = setTimeout(() => {
        this.client.off('camera', onCameraImage);
        console.error(`Camera snapshot timed out for ${this.device.name}`);
        resolve(undefined);
      }, 5000); // 5 second timeout

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onCameraImage = (payload: any) => {
        // Actual payload is { image: Buffer; name: string } not what types say
        if (
          !payload.image ||
          !Buffer.isBuffer(payload.image) ||
          payload.image.length === 0
        ) {
          return;
        }

        clearTimeout(timeout);
        this.client.off('camera', onCameraImage);
        resolve(payload.image);
      };

      this.client.on('camera', onCameraImage);

      try {
        this.client.sendCameraImageRequest(true);
      } catch (error) {
        clearTimeout(timeout);
        this.client.off('camera', onCameraImage);
        console.error(
          `Failed to request camera image for ${this.device.name}:`,
          error,
        );
        resolve(undefined);
      }
    });
  }

  async captureSnapshot(options: {
    timestamp: Date;
    crop?: { left: number; top: number; width: number; height: number };
    rotate?: number;
  }): Promise<PendingMedia | undefined> {
    if (!this.state.hasCamera) {
      return undefined;
    }

    try {
      const buffer = await this.getSnapshotBuffer();
      if (!buffer) {
        return undefined;
      }

      const image = sharp(buffer);
      const metadata = await image.metadata();

      const pendingMedia = await this.deps.mediaManager.createPendingMedia(
        'jpg',
        {
          height: metadata.height,
          width: metadata.width,
        },
      );

      let pipeline = sharp(buffer);

      if (options.crop) {
        const { left, top, width, height } = options.crop;
        let absCrop = { left, top, width, height };

        // If all crop values are <= 1, assume they are normalized (0-1) and convert to absolute pixels
        if (left <= 1 && top <= 1 && width <= 1 && height <= 1) {
          absCrop = {
            left: Math.round(left * metadata.width!),
            top: Math.round(top * metadata.height!),
            width: Math.round(width * metadata.width!),
            height: Math.round(height * metadata.height!),
          };
        }

        pipeline = pipeline.extract(absCrop);
      }

      if (options.rotate) {
        pipeline = pipeline.rotate(options.rotate);
      }

      await pipeline.toFile(pendingMedia.path);

      console.log(`Snapshot saved to ${pendingMedia.path}`);
      return pendingMedia;
    } catch (error) {
      console.error(
        `Error capturing snapshot for fountain ${this.device.name}:`,
        error,
      );
      return undefined;
    }
  }

  getState() {
    return {
      ...this.state,
      ...super.getState(),
    };
  }
}
