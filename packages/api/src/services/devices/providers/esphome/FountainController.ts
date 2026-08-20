import { type Entity as EspHomeEntity } from 'esphome-client';
import { sql } from 'kysely';
import sharp from 'sharp';
import {
  analyzeDrinkingFromSamples,
  DEVICE_SIGNAL_KEYS,
  encodeWaterRawData,
  type DeviceSignal,
  type DrinkingAnalysis,
  WATER_RAW_DATA_VERSION_1,
  type WaterFountainState,
} from 'shared';
import type { Camera, ProviderDeps, Device } from '../../types.ts';
import {
  daysRemainingSignal,
  intervalCountdownSignal,
  percentSignal,
  statusSignal,
  unknownSignal,
} from '../../signalBuilders.ts';
import type { PendingMedia } from '../../../media/MediaManager.ts';
import type { NewEvent } from '../../../../database/types/EventTable.ts';
import type { WaterIntakeEventData } from '../../../../domain/events.ts';
import { recordDeviceEvent } from '../../../events/recordDeviceEvent.ts';
import {
  BaseESPHomeController,
  coerceBooleanState,
  type ReconnectConfig,
} from './BaseESPHomeController.ts';
import { readSchedule, waterScheduleContract } from './scheduleBindings.ts';

const SENSORS = {
  ACTIVITY: 'activity',
  WATER_LEVEL: 'water_level',
  LAST_DRINK_AMOUNT: 'last_drink_amount',
  LAST_DRINK_DURATION: 'last_drink_duration',
  UNFILTERED_WEIGHT: 'unfiltered_weight',
  /** Optional fault flag; a firmware that can't detect faults omits it. */
  PUMP_FAULT: 'pump_fault',
  /** Optional: on when the bowl is off its scale, which voids every reading. */
  BOWL_MISSING: 'bowl_missing',
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

function analyzeDrinkingSegments(
  measurements: RawMeasurement[],
): DrinkingAnalysis {
  return analyzeDrinkingFromSamples(
    measurements.map((measurement) => ({
      timestampMs: measurement.timestamp.getTime(),
      weight: measurement.weight,
    })),
  );
}

export class FountainController
  extends BaseESPHomeController
  implements Camera
{
  private currentEvent: NewEvent<WaterIntakeEventData> | null = null;
  private currentSession: WaterSession | null = null;
  private state: WaterFountainState = {
    waterLevel: 0,
  };
  private snapshotCaptureChain: Promise<Buffer | undefined> =
    Promise.resolve(undefined);

  constructor(device: Device, deps: ProviderDeps) {
    super(device, deps);
    // Restore from a prior discovery so offline devices still advertise
    // the integrated camera in state (picker + getLinkedCamera fallback).
    if (this.config.hasCamera) {
      this.state.hasCamera = true;
    }
  }

  protected get deviceTypeName(): string {
    return 'fountain';
  }

  protected get reconnectConfig(): ReconnectConfig {
    // Heartbeat tolerance matches the litterbox (30s/15s). The old 3s/1s
    // killed every connection seconds after the entity list — before the
    // post-subscribe state dump could land — because an idle bowl publishes
    // nothing between drinks, so keepalive rides on ping/pong alone and one
    // slow pong was fatal. Symptom: perpetual reconnect churn (~1800 flaps
    // in two days) and water_level stuck at 0% after every server restart.
    return {
      baseDelay: 1000,
      maxDelay: 30000,
      heartbeatTimeout: 30000,
      pingInterval: 15000,
      connectHandshakeTimeout: 12000,
    };
  }

  protected onConnected(): void {
    // No additional setup needed on connect
  }

  protected onEntitiesReceived(entities: EspHomeEntity[]): void {
    // Detect camera entities. The state flag doubles as a run-once guard so
    // multiple camera entities or a reconnect's entity dump cannot fire
    // overlapping persists.
    const hasCameraEntity = entities.some(
      (entity) => 'type' in entity && entity.type === 'camera',
    );
    if (hasCameraEntity && !this.state.hasCamera) {
      this.state.hasCamera = true;
      console.log(`Detected camera in ${this.device.name}`);
      void this.persistHasCameraFlag();
    }
  }

  protected handleSensorUpdate(key: number, state: unknown): void {
    const waterLevelKey = this.getEntityKey(SENSORS.WATER_LEVEL);
    if (waterLevelKey !== null && key === waterLevelKey) {
      /* A bowl lifted off the scale publishes NaN — ESPHome's "unknown" —
       * and NaN survives Math.round. Keep the last known level instead:
       * the mirror is read when the live reading is missing, so writing an
       * unknown into it is worse than being stale. */
      if (typeof state === 'number' && Number.isFinite(state)) {
        this.state.waterLevel = Math.round(state);
      }
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

    // Override binary_sensor handler to add activity tracking. Must coerce
    // like the base listener, or this second set() would clobber the
    // coerced value with the raw wire one.
    this.client.on('binary_sensor', async (data) => {
      const { key } = data;
      const state = coerceBooleanState(data.state, data.missingState);
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
            const rawData = this.buildWaterRawDataBuffer(
              session.startTime,
              session.measurements,
            );

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

      if (
        drinkAmountKey !== null &&
        event.key === drinkAmountKey &&
        event.state != null
      ) {
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

  private buildWaterRawDataBuffer(
    startTime: Date,
    measurements: RawMeasurement[],
  ): Buffer {
    const waterLevelKey = this.getEntityKey(SENSORS.WATER_LEVEL);
    let waterLevel: number | null = null;
    if (waterLevelKey !== null) {
      const raw = this.sensorValues.get(waterLevelKey) as number | undefined;
      waterLevel = Math.min(100, Math.max(0, Math.round(raw ?? 255)));
    }

    const encoded = encodeWaterRawData({
      version: WATER_RAW_DATA_VERSION_1,
      startTimeMs: startTime.getTime(),
      context: { waterLevel },
      weights: measurements.map((measurement) => measurement.weight),
    });

    return Buffer.from(encoded);
  }

  /**
   * Remember that this fountain exposed a camera entity so the picker still
   * offers Integrated Camera after reconnects / while offline. json_set
   * patches the one key inside the stored JSON string, so a concurrent write
   * that replaces the whole column (PATCH /devices/:id) is never reverted
   * from a stale snapshot read here. Deliberately does not bump updated_at:
   * this is a server-internal cache flag, not a user edit, and should not
   * churn client caches.
   */
  private async persistHasCameraFlag(): Promise<void> {
    if (this.config.hasCamera) return;

    try {
      await this.deps.db
        .updateTable('device')
        .set({
          config: sql`json_set(coalesce(config, '{}'), '$.hasCamera', json('true'))`,
        })
        .where('id', '=', this.deviceId)
        .where(sql<boolean>`json_extract(config, '$.hasCamera') is not 1`)
        .execute();
      this.config.hasCamera = true;
    } catch (err) {
      console.error(
        `Failed to persist hasCamera flag for ${this.device.name}:`,
        err,
      );
    }
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

  getSignals(): DeviceSignal[] {
    // Read from sensorValues, not the `state` copies: the initial state dump
    // on connect can race ahead of the entity list, in which case
    // handleSensorUpdate cannot match keys and `state` keeps its default.
    // sensorValues is populated regardless of ordering and survives
    // reconnects, so it holds the last honest reading.
    // Rounded like handleSensorUpdate always did — the raw sensor floats
    // (58.61366653442383%) are not display values.
    //
    // No reading means unknown, never 0%: the level is NaN whenever the bowl
    // is off its scale, and drawing that as an empty bowl invents an alarm
    // out of a bowl in the sink. The dash is the honest answer, and
    // `bowl_missing` below says why.
    const waterLevel = this.sensorNumber(SENSORS.WATER_LEVEL);
    const signals: DeviceSignal[] = [
      waterLevel !== null
        ? percentSignal(
            { key: DEVICE_SIGNAL_KEYS.WATER_LEVEL, icon: 'water' },
            Math.round(waterLevel),
          )
        : unknownSignal({ key: DEVICE_SIGNAL_KEYS.WATER_LEVEL, icon: 'water' }),
    ];

    /* Only worth a line when it is true — a bowl sitting where it belongs is
     * not news, and the firmware that can't tell omits the entity. */
    if (this.sensorBoolean(SENSORS.BOWL_MISSING) === true) {
      signals.push(
        statusSignal(
          { key: DEVICE_SIGNAL_KEYS.BOWL_MISSING, icon: 'alert' },
          'devices.signals.values.bowl_removed',
          true,
        ),
      );
    }

    /*
     * Schedules resolve from the entity list on every read, in whichever
     * shape this firmware speaks (see scheduleBindings.ts). Nothing is
     * seeded or cached in `state`, so a restart on either end costs at most
     * one publish — the same reasoning as `sensorValues` above.
     */
    const contract = waterScheduleContract(this.config.projectName);
    const reader = this.scheduleReader();
    const nowMs = Date.now();

    const freshness = readSchedule(contract.waterFreshness, reader, nowMs);
    if (freshness) {
      signals.push(
        intervalCountdownSignal(
          { key: DEVICE_SIGNAL_KEYS.WATER_FRESHNESS, icon: 'drop' },
          freshness.daysRemaining,
          freshness.intervalDays,
        ),
      );
    }

    const filter = readSchedule(contract.filterLife, reader, nowMs);
    if (filter) {
      signals.push(
        daysRemainingSignal(
          { key: DEVICE_SIGNAL_KEYS.FILTER_LIFE, icon: 'filter' },
          Math.round(filter.daysRemaining),
          filter.intervalDays ?? this.config.filterIntervalDays,
        ),
      );
    }

    const pumpFault = this.sensorBoolean(SENSORS.PUMP_FAULT);
    if (pumpFault !== null) {
      signals.push(
        statusSignal(
          {
            key: DEVICE_SIGNAL_KEYS.PUMP_FLOW,
            icon: pumpFault ? 'alert' : 'check',
          },
          `devices.signals.values.pump_${pumpFault ? 'error' : 'ok'}`,
          pumpFault,
        ),
      );
    }

    return [...signals, ...this.diagnosticSignals()];
  }

  getState() {
    return {
      ...this.state,
      ...super.getState(),
    };
  }
}
