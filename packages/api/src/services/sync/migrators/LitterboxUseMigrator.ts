import { sql } from 'kysely';
import type { NewEvent } from '../../../database/types/EventTable.ts';
import { appConfig } from './../config.ts';
import type {
  EventMigrator,
  MigratorOptions,
  MigrationStats,
} from './../types.ts';

interface RawMeasurement {
  timestamp: Date;
  weight: number; // in grams
}

interface EventSession {
  startTime: Date;
  endTime: Date;
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

export class LitterboxUseMigrator implements EventMigrator {
  readonly name = 'LitterboxUseMigrator';
  private options: MigratorOptions;

  constructor(options: MigratorOptions) {
    this.options = options;
  }

  async migrate(startDate: Date, endDate: Date): Promise<void> {
    console.log(`\n=== ${this.name} Migration ===`);
    console.log(
      `Processing litterbox events from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    const stats: MigrationStats = {
      processed: 0,
      skipped: 0,
      inserted: 0,
      errors: 0,
    };

    try {
      // Check for existing litterbox events
      const existingEvents = await this.getExistingLitterboxEvents(
        startDate,
        endDate,
      );
      console.log(
        `Found ${existingEvents.size} existing litterbox events in time range`,
      );

      // Get event sessions from InfluxDB
      const sessions = await this.queryInfluxForEventSessions(
        startDate,
        endDate,
      );
      console.log(`Found ${sessions.length} litterbox sessions`);
      stats.processed = sessions.length;

      const newEvents: NewEvent[] = [];
      const eventSessionMap: Map<string, EventSession> = new Map();

      for (const session of sessions) {
        // Skip if this event timestamp already exists
        if (existingEvents.has(session.startTime.toISOString())) {
          stats.skipped++;
          console.log(
            `Skipping existing event at ${session.startTime.toISOString()}`,
          );
          continue;
        }

        const processedEvent = await this.processEventSession(session);
        if (processedEvent) {
          newEvents.push(processedEvent);
          eventSessionMap.set(processedEvent.timestamp.toISOString(), session);
        }
      }

      // Batch insert new events
      if (newEvents.length > 0) {
        console.log(`Inserting ${newEvents.length} new litterbox events...`);
        await this.options.db.insertInto('event').values(newEvents).execute();
        stats.inserted = newEvents.length;

        // Download videos for new events if camera is configured
        await this.downloadVideosForEvents(newEvents, eventSessionMap);
      } else {
        console.log('No new litterbox events to insert.');
      }

      this.logStats(stats);
    } catch (error) {
      console.error(`${this.name} migration failed:`, error);
      stats.errors++;
      throw error;
    }
  }

  private async getExistingLitterboxEvents(
    startDate: Date,
    endDate: Date,
  ): Promise<Set<string>> {
    const existingEvents = await this.options.db
      .selectFrom('event')
      .select(['timestamp'])
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .where(sql`json_extract(data, '$.type')`, 'in', [
        'litterbox_use',
        'litterbox_maintenance',
      ])
      .execute();

    return new Set(existingEvents.map((e) => e.timestamp.toISOString()));
  }

  private async queryInfluxForEventSessions(
    startDate: Date,
    endDate: Date,
  ): Promise<EventSession[]> {
    const queryApi = this.options.influx.getQueryApi(appConfig.influx.org);

    // Get activity sensor state changes
    const activityQuery = `
      from(bucket: "${appConfig.influx.bucket}")
        |> range(start: ${startDate.toISOString()}, stop: ${endDate.toISOString()})
        |> filter(fn: (r) => r["friendly_name"] == "Litterbox Activity")
        |> filter(fn: (r) => r["_field"] == "value")
        |> sort(columns: ["_time"])
        |> yield(name: "activity")
    `;

    const activityEvents: Array<{ timestamp: Date; value: number }> = [];

    return new Promise((resolve, reject) => {
      queryApi.queryRows(activityQuery, {
        next: (row, tableMeta) => {
          const obj = tableMeta.toObject(row);
          activityEvents.push({
            timestamp: new Date(obj._time),
            value: obj._value,
          });
        },
        error: reject,
        complete: () => {
          // Parse activity events into sessions
          const sessions: EventSession[] = [];
          let currentStart: Date | null = null;

          for (const event of activityEvents) {
            if (event.value === 1 && currentStart === null) {
              // Activity started
              currentStart = event.timestamp;
            } else if (event.value === 0 && currentStart !== null) {
              // Activity ended
              const duration =
                event.timestamp.getTime() - currentStart.getTime();
              if (duration > 10000) {
                // At least 10 seconds
                sessions.push({
                  startTime: currentStart,
                  endTime: event.timestamp,
                  measurements: [], // Will be populated later if needed
                });
              } else {
                console.warn(
                  `Ignoring short activity session at ${event.timestamp.toISOString()} (${duration}ms)`,
                );
              }
              currentStart = null;
            }
          }

          // Handle case where last event didn't have an end
          if (currentStart !== null) {
            console.warn(
              `Found activity start at ${currentStart.toISOString()} without corresponding end`,
            );
          }

          console.log(
            `Parsed ${sessions.length} activity sessions from ${activityEvents.length} state changes`,
          );
          resolve(sessions);
        },
      });
    });
  }

  private async processEventSession(
    session: EventSession,
  ): Promise<NewEvent | null> {
    try {
      const [rawMeasurements, taredMeasurements] = await Promise.all([
        this.queryRawWeightData(session.startTime, session.endTime),
        this.queryTaredWeightData(session.startTime, session.endTime),
      ]);

      if (rawMeasurements.length === 0 || taredMeasurements.length === 0) {
        console.log(
          `Missing measurements for session ${session.startTime.toISOString()} - ${session.endTime.toISOString()}`,
        );
        return null;
      }

      // Calculate tare offset using final stable readings
      const sampleCount = 5;
      const finalRaw =
        rawMeasurements
          .slice(-sampleCount)
          .reduce((sum, m) => sum + m.weight, 0) / sampleCount;
      const finalTared =
        taredMeasurements
          .slice(-sampleCount)
          .reduce((sum, m) => sum + m.weight, 0) / sampleCount;
      const tareOffset = finalRaw - finalTared;

      // Apply tare to all raw measurements
      const measurements = rawMeasurements.map((m) => ({
        ...m,
        weight: m.weight - tareOffset,
      }));

      console.log(
        `Tare offset: ${tareOffset}g, final tared weight: ${finalTared}g`,
      );

      // Calculate basic metrics
      const duration = session.endTime.getTime() - session.startTime.getTime();
      const eliminationWeight = finalTared;

      // Query context data for this event
      const contextData = await this.queryContextData(session.startTime);

      // Encode raw data with context
      const rawData = this.encodeRawData(
        session.startTime,
        measurements,
        contextData || undefined,
      );

      if (eliminationWeight < appConfig.litterbox.maintenanceThreshold) {
        // This is a maintenance event (waste removal/scooping)
        console.log(
          `Detected maintenance event at ${session.startTime.toISOString()}: ${eliminationWeight}g`,
        );

        return {
          pet_id: null, // Maintenance events are not assigned to specific pets
          device_id: 1,
          timestamp: session.startTime,
          data: {
            type: 'litterbox_maintenance',
            maintenance_type: 'scoop',
          },
          raw_data: rawData,
          human_verified: false,
        };
      } else {
        // This is a regular litterbox use event
        const petId = await this.determinePetId(
          measurements,
          session.startTime,
        );

        // Determine elimination type based on ending weight
        let eliminationType:
          | 'urination'
          | 'defecation'
          | 'both'
          | 'no_elimination'
          | 'unknown';
        if (eliminationWeight < appConfig.litterbox.noEliminationThreshold) {
          eliminationType = 'no_elimination';
          console.log(
            `Marking event at ${session.startTime.toISOString()} as no_elimination (weight: ${eliminationWeight}g)`,
          );
        } else {
          eliminationType = 'unknown';
        }

        return {
          pet_id: petId,
          device_id: 1, // Main Litter Box device
          timestamp: session.startTime,
          data: {
            type: 'litterbox_use',
            elimination_type: eliminationType,
            elimination_weight: Math.round(Math.max(0, eliminationWeight)),
            duration,
          },
          raw_data: rawData,
          human_verified: false,
        };
      }
    } catch (error) {
      console.error(
        `Error processing session at ${session.startTime.toISOString()}:`,
        error,
      );
      return null;
    }
  }

  private async queryRawWeightData(
    startTime: Date,
    endTime: Date,
  ): Promise<RawMeasurement[]> {
    const queryApi = this.options.influx.getQueryApi(appConfig.influx.org);

    const weightQuery = `
      from(bucket: "${appConfig.influx.bucket}")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r["friendly_name"] == "Litterbox Unfiltered Weight")
        |> filter(fn: (r) => r["_field"] == "value")
        |> sort(columns: ["_time"])
        |> yield(name: "kilograms")
    `;

    const measurements: RawMeasurement[] = [];

    return new Promise((resolve, reject) => {
      queryApi.queryRows(weightQuery, {
        next: (row, tableMeta) => {
          const obj = tableMeta.toObject(row);
          measurements.push({
            timestamp: new Date(obj._time),
            weight: obj._value * 1000, // Convert kg to grams
          });
        },
        error: reject,
        complete: () => {
          console.log(
            `Found ${measurements.length} raw weight measurements for session ${startTime.toISOString()} - ${endTime.toISOString()}`,
          );
          resolve(measurements);
        },
      });
    });
  }

  private async queryTaredWeightData(
    startTime: Date,
    endTime: Date,
  ): Promise<RawMeasurement[]> {
    const queryApi = this.options.influx.getQueryApi(appConfig.influx.org);

    const taredQuery = `
      from(bucket: "${appConfig.influx.bucket}")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r["friendly_name"] == "Litterbox Tared Weight")
        |> filter(fn: (r) => r["_field"] == "value")
        |> sort(columns: ["_time"])
        |> yield(name: "kilograms")
    `;

    const measurements: RawMeasurement[] = [];

    return new Promise((resolve, reject) => {
      queryApi.queryRows(taredQuery, {
        next: (row, tableMeta) => {
          const obj = tableMeta.toObject(row);
          measurements.push({
            timestamp: new Date(obj._time),
            weight: obj._value * 1000, // Convert kg to grams
          });
        },
        error: reject,
        complete: () => resolve(measurements),
      });
    });
  }

  private async queryContextData(timestamp: Date): Promise<ContextData | null> {
    const queryApi = this.options.influx.getQueryApi(appConfig.influx.org);

    // Query current context values
    const daysBefore7 = new Date(timestamp.getTime() - 7 * 24 * 60 * 60 * 1000);
    const contextQuery = `
      from(bucket: "${appConfig.influx.bucket}")
        |> range(start: ${daysBefore7.toISOString()}, stop: ${timestamp.toISOString()})
        |> filter(fn: (r) => r["friendly_name"] == "Litterbox Waste Weight" or 
                             r["friendly_name"] == "Litterbox Litter Remaining" or
                             r["friendly_name"] == "Litterbox Deep Clean Timer" or
                             r["friendly_name"] == "Visits")
        |> filter(fn: (r) => r["_field"] == "value")
        |> group(columns: ["friendly_name"])
        |> last()
        |> yield(name: "context")
    `;

    // Query to find when waste weight was last reset to 0 (scooped)
    const daysBefore30 = new Date(
      timestamp.getTime() - 30 * 24 * 60 * 60 * 1000,
    );
    const lastScoopQuery = `
      from(bucket: "${appConfig.influx.bucket}")
        |> range(start: ${daysBefore30.toISOString()}, stop: ${timestamp.toISOString()})
        |> filter(fn: (r) => r["friendly_name"] == "Litterbox Waste Weight")
        |> filter(fn: (r) => r["_field"] == "value")
        |> filter(fn: (r) => r._value == 0.0)
        |> last()
        |> yield(name: "last_scoop")
    `;

    const contextData: Record<string, number> = {};
    let lastScoopTime: Date | null = null;

    return new Promise((resolve) => {
      let completedQueries = 0;

      // Query context data
      queryApi.queryRows(contextQuery, {
        next: (row, tableMeta) => {
          const obj = tableMeta.toObject(row);
          contextData[obj.friendly_name] = obj._value;
        },
        error: (err) => {
          console.error('Context query error:', err);
          completedQueries++;
          if (completedQueries === 2) resolve(null);
        },
        complete: () => {
          completedQueries++;
          if (completedQueries === 2) finishProcessing();
        },
      });

      // Query last scoop time
      queryApi.queryRows(lastScoopQuery, {
        next: (row, tableMeta) => {
          const obj = tableMeta.toObject(row);
          lastScoopTime = new Date(obj._time);
        },
        error: (err) => {
          console.error('Last scoop query error:', err);
          completedQueries++;
          if (completedQueries === 2) finishProcessing();
        },
        complete: () => {
          completedQueries++;
          if (completedQueries === 2) finishProcessing();
        },
      });

      function finishProcessing() {
        if (Object.keys(contextData).length === 0) {
          resolve(null);
          return;
        }

        const deepCleanTimer = contextData['Litterbox Deep Clean Timer'] || 0;
        const wasteWeight = contextData['Litterbox Waste Weight'] || 0;

        // Calculate derived metrics
        const daysSinceLitterReplaced = Math.max(
          0,
          Math.round(30 - deepCleanTimer),
        );

        // Calculate hours since last scoop
        let hoursSinceLastScoop = 0;
        if (lastScoopTime && wasteWeight > 5) {
          const timeDiff = timestamp.getTime() - lastScoopTime.getTime();
          hoursSinceLastScoop = Math.round(timeDiff / (1000 * 60 * 60));
          hoursSinceLastScoop = Math.min(254, Math.max(0, hoursSinceLastScoop));
        }

        resolve({
          wasteWeight,
          litterRemaining:
            contextData['Litterbox Litter Remaining'] * 1000 || 0,
          deepCleanTimer,
          totalVisits: contextData['Visits'] || 0,
          daysSinceLitterReplaced,
          hoursSinceLastScoop,
        });
      }
    });
  }

  private async determinePetId(
    measurements: RawMeasurement[],
    eventTimestamp: Date,
  ): Promise<number | null> {
    // Calculate median weight during event
    const weights = measurements.map((m) => m.weight).sort((a, b) => a - b);
    const median = weights[Math.floor(weights.length / 2)];

    // Query latest weight measurements for all pets before this event
    const latestWeights = await this.getLatestPetWeights(eventTimestamp);

    if (latestWeights.size === 0) {
      console.log(
        `No weight measurements found before ${eventTimestamp.toISOString()}, cannot determine pet`,
      );
      return null;
    }

    // Find closest cat weight within 10% margin
    let closestPetId: number | null = null;
    let minDiff = Infinity;
    const marginPercent = 0.1; // 10% margin

    for (const [petId, catWeight] of latestWeights) {
      const diff = Math.abs(median - catWeight);
      const margin = catWeight * marginPercent;

      // Only consider this pet if within the 10% margin
      if (diff <= margin && diff < minDiff) {
        minDiff = diff;
        closestPetId = petId;
      }
    }

    if (closestPetId === null) {
      console.log(
        `No cat found within 10% margin for median weight ${median}g at ${eventTimestamp.toISOString()}`,
      );
      console.log(
        `Available cat weights:`,
        Array.from(latestWeights.entries()).map(
          ([id, weight]) => `${id}: ${weight}g`,
        ),
      );
    } else {
      const catWeight = latestWeights.get(closestPetId)!;
      console.log(
        `Identified cat ${closestPetId} (weight: ${catWeight}g) for median ${median}g (diff: ${Math.abs(median - catWeight)}g)`,
      );
    }

    return closestPetId;
  }

  private async getLatestPetWeights(
    beforeTimestamp: Date,
  ): Promise<Map<number, number>> {
    const latestWeights = new Map<number, number>();

    // Query latest weight measurement for each pet before the given timestamp
    const weightEvents = await this.options.db
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

  private async downloadVideosForEvents(
    events: NewEvent[],
    eventSessionMap: Map<string, EventSession>,
  ): Promise<void> {
    if (!appConfig.litterbox.camera.ip) {
      console.log(
        '\n⚠️ Skipping video downloads - LITTERBOX_CAMERA_IP not configured!',
      );
      return;
    }

    console.log(`\n=== Video Download Phase ===`);
    console.log(`Downloading videos for ${events.length} events...`);

    // Download videos sequentially to avoid overwhelming the camera
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventData = event.data;
      const eventTimestampKey = event.timestamp.toISOString();
      const session = eventSessionMap.get(eventTimestampKey);

      if (session) {
        if (eventData.type === 'litterbox_use') {
          await this.options.mediaService.downloadVideo(
            session.startTime,
            session.endTime,
            'litterbox_use',
          );
        } else if (eventData.type === 'litterbox_maintenance') {
          await this.options.mediaService.downloadVideo(
            session.startTime,
            session.endTime,
            'litterbox_maintenance',
          );
        }
      } else {
        // Fallback to calculated end time if session not found
        if (eventData.type === 'litterbox_use') {
          const duration = eventData.duration || 120000; // Default to 2 minutes if duration missing
          const endTime = new Date(event.timestamp.getTime() + duration);
          await this.options.mediaService.downloadVideo(
            event.timestamp,
            endTime,
            'litterbox_use',
          );
        } else if (eventData.type === 'litterbox_maintenance') {
          // For maintenance events, use a fixed 3-minute duration
          const endTime = new Date(event.timestamp.getTime() + 3 * 60 * 1000);
          await this.options.mediaService.downloadVideo(
            event.timestamp,
            endTime,
            'litterbox_maintenance',
          );
        }
      }

      // Progress indicator
      console.log(`  Progress: ${i + 1}/${events.length} videos processed`);
    }

    console.log('✅ Video download phase completed.');
  }

  private logStats(stats: MigrationStats): void {
    const useEvents = stats.inserted - (stats.inserted > 0 ? 1 : 0); // Rough estimate
    const maintenanceEvents = stats.inserted > 0 ? 1 : 0; // Rough estimate

    console.log(`\n=== ${this.name} Stats ===`);
    console.log(`Sessions processed: ${stats.processed}`);
    console.log(`Events skipped (existing): ${stats.skipped}`);
    console.log(`New litterbox use events: ${useEvents}`);
    console.log(`New maintenance events: ${maintenanceEvents}`);
    console.log(`Total events inserted: ${stats.inserted}`);
    console.log(`Errors: ${stats.errors}`);
  }
}
