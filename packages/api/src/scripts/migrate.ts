import { InfluxDB } from "@influxdata/influxdb-client";
import type { NewEvent } from "../database/types/EventTable.ts";
import { db } from "../database/index.ts";
import { sql } from "kysely";
import fs from "fs";

interface RawMeasurement {
  timestamp: Date;
  weight: number; // in grams
}

interface EventSession {
  startTime: Date;
  endTime: Date;
  measurements: RawMeasurement[];
}

const ORG = "ead56babe1bae2a1";

// Binary encoding for raw data storage
function encodeRawData(
  startTime: Date,
  measurements: RawMeasurement[],
  context?: {
    wasteWeight: number;
    litterRemaining: number;
    deepCleanTimer: number;
    totalVisits: number;
    daysSinceLitterReplaced: number;
    hoursSinceLastScoop: number;
  }
): Buffer {
  // Format v1: [version:1byte][startTimestamp:8bytes][context:10bytes][count:4bytes][weights:count*2bytes]
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
    const wasteWeight = Math.min(65534, Math.max(0, Math.round(context.wasteWeight)));
    buffer.writeUInt16BE(wasteWeight, offset);
    offset += 2;
    
    // Litter remaining: 0-50kg (50000g) fits in uint16  
    const litterRemaining = Math.min(65534, Math.max(0, Math.round(context.litterRemaining)));
    buffer.writeUInt16BE(litterRemaining, offset);
    offset += 2;
    
    // Deep clean timer: 0-255 hours fits in uint8
    const deepCleanTimer = Math.min(254, Math.max(0, Math.round(context.deepCleanTimer)));
    buffer.writeUInt8(deepCleanTimer, offset);
    offset += 1;
    
    // Total visits: 0-255 fits in uint8
    const totalVisits = Math.min(254, Math.max(0, Math.round(context.totalVisits)));
    buffer.writeUInt8(totalVisits, offset);
    offset += 1;
    
    // Days since litter replaced: 0-254 days fits in uint8
    const daysSinceLitterReplaced = Math.min(254, Math.max(0, Math.round(context.daysSinceLitterReplaced)));
    buffer.writeUInt8(daysSinceLitterReplaced, offset);
    offset += 1;
    
    // Hours since last scoop: 0-254 hours fits in uint8
    const hoursSinceLastScoop = Math.min(254, Math.max(0, Math.round(context.hoursSinceLastScoop)));
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

  // Store tared weights first (our calculated weights from measurements)
  for (const measurement of measurements) {
    const weight = Math.round(measurement.weight);
    // Clamp to int16 range
    const clampedWeight = Math.max(-32768, Math.min(32767, weight));
    buffer.writeInt16BE(clampedWeight, offset);
    offset += 2;
  }
  return buffer;
}

async function queryContextData(
  influx: InfluxDB,
  bucket: string,
  timestamp: Date
): Promise<{
  wasteWeight: number;
  litterRemaining: number;
  deepCleanTimer: number;
  totalVisits: number;
  daysSinceLitterReplaced: number;
  hoursSinceLastScoop: number;
} | null> {
  const queryApi = influx.getQueryApi(ORG);
  
  // Query current context values
  const daysBefore7 = new Date(timestamp.getTime() - 7 * 24 * 60 * 60 * 1000);
  const contextQuery = `
    from(bucket: "${bucket}")
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
  const daysBefore30 = new Date(timestamp.getTime() - 30 * 24 * 60 * 60 * 1000);
  const lastScoopQuery = `
    from(bucket: "${bucket}")
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
        console.error("Query error:", err);
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
        console.error("Query error:", err);
        completedQueries++;
        if (completedQueries === 2) finishProcessing();
      },
      complete: () => {
        completedQueries++;
        if (completedQueries === 2) finishProcessing();
      },
    });

    function finishProcessing() {
      if (Object.keys(contextData).length == 0) { 
        resolve(null);
        return;
      }
      const deepCleanTimer = contextData["Litterbox Deep Clean Timer"] || 0;
      const wasteWeight = contextData["Litterbox Waste Weight"] || 0;
      
      // Calculate derived metrics
      const daysSinceLitterReplaced = Math.max(0, Math.round(30 - deepCleanTimer)); // 30 day countdown -> days elapsed
      
      // Calculate hours since last scoop
      let hoursSinceLastScoop = 0;
      if (lastScoopTime && wasteWeight > 5) {
        const timeDiff = timestamp.getTime() - lastScoopTime.getTime();
        hoursSinceLastScoop = Math.round(timeDiff / (1000 * 60 * 60)); // Convert ms to hours
        hoursSinceLastScoop = Math.min(254, Math.max(0, hoursSinceLastScoop)); // Clamp to uint8 range
      }
      
      resolve({
        wasteWeight,
        litterRemaining: contextData["Litterbox Litter Remaining"] * 1000 || 0,
        deepCleanTimer,
        totalVisits: contextData["Visits"] || 0,
        daysSinceLitterReplaced,
        hoursSinceLastScoop,
      });
    }
  });
}

async function queryInfluxForEvents(
  influx: InfluxDB,
  bucket: string,
  startDate: Date,
  endDate: Date
): Promise<EventSession[]> {
  const queryApi = influx.getQueryApi(ORG);

  // Get activity sensor state changes
  const activityQuery = `
    from(bucket: "${bucket}")
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
      error: (error) => {
        console.error("Query error:", error);
        reject(error);
      },
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
            const duration = event.timestamp.getTime() - currentStart.getTime();
            if (duration > 10000) {
              sessions.push({
                startTime: currentStart,
                endTime: event.timestamp,
                measurements: [], // Will be populated later
              });
            } else {
              // Ignore state changes that don't form a complete session
              console.warn(
                `Ignoring incomplete activity state change at ${event.timestamp.toISOString()}`
              );
            }
            currentStart = null;
          }
        }

        // Handle case where last event didn't have an end
        if (currentStart !== null) {
          console.warn(
            `Found activity start at ${currentStart.toISOString()} without corresponding end`
          );
        }

        console.log(
          `Parsed ${sessions.length} activity sessions from ${activityEvents.length} state changes`
        );
        resolve(sessions);
      },
    });
  });
}

async function queryRawWeightData(
  influx: InfluxDB,
  bucket: string,
  startTime: Date,
  endTime: Date
): Promise<RawMeasurement[]> {
  const queryApi = influx.getQueryApi(ORG);

  const weightQuery = `
    from(bucket: "${bucket}")
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
          `Found ${
            measurements.length
          } weight measurements for session ${startTime.toISOString()} - ${endTime.toISOString()}`
        );
        resolve(measurements);
      },
    });
  });
}

function determinePetId(
  measurements: RawMeasurement[],
  catWeights: Record<number, number>
): number {
  // Calculate median weight during event
  const weights = measurements.map((m) => m.weight).sort((a, b) => a - b);
  const median = weights[Math.floor(weights.length / 2)];

  // Find closest cat weight (assuming weights are in grams)
  let closestPetId = 1;
  let minDiff = Infinity;

  for (const [petId, catWeight] of Object.entries(catWeights)) {
    const diff = Math.abs(median - catWeight);
    if (diff < minDiff) {
      minDiff = diff;
      closestPetId = parseInt(petId);
    }
  }

  return closestPetId;
}

async function queryTaredWeightData(
  influx: InfluxDB,
  bucket: string,
  startTime: Date,
  endTime: Date
): Promise<RawMeasurement[]> {
  const queryApi = influx.getQueryApi(ORG);

  const taredQuery = `
    from(bucket: "${bucket}")
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
          weight: obj._value * 1000,
        });
      },
      error: reject,
      complete: () => resolve(measurements),
    });
  });
}

async function checkExistingEvents(
  startDate: Date,
  endDate: Date
): Promise<Set<string>> {
  const existingEvents = await db
    .selectFrom("event")
    .select(["timestamp"])
    .where("timestamp", ">=", startDate)
    .where("timestamp", "<=", endDate)
    .where(sql`json_extract(data, '$.type')`, "=", "litterbox_use")
    .execute();

  // Create a set of timestamp strings for O(1) lookup
  return new Set(existingEvents.map(e => e.timestamp.toISOString()));
}

async function migrateEvents(
  startDate: Date,
  endDate: Date,
  influxUrl: string,
  influxToken: string,
  bucket: string
) {
  console.log(
    `Migrating litterbox events from ${startDate.toISOString()} to ${endDate.toISOString()}`
  );

  // Check for existing events in this time range
  console.log("Checking for existing events in database...");
  const existingEventTimestamps = await checkExistingEvents(startDate, endDate);
  console.log(`Found ${existingEventTimestamps.size} existing litterbox events in time range`);

  // Initialize connections
  const influx = new InfluxDB({ url: influxUrl, token: influxToken });

  // Your cat weights in grams - update these values
  const catWeights = {
    1: 6600, // 6.6kg cat
    2: 4300, // 4.3kg cat
  };

  try {
    // Get event sessions from InfluxDB
    const sessions = await queryInfluxForEvents(
      influx,
      bucket,
      startDate,
      endDate
    );
    console.log(`Found ${sessions.length} litterbox sessions`);

    const events: NewEvent[] = [];
    let skippedCount = 0;

    for (const session of sessions) {
      // Skip if this event timestamp already exists
      if (existingEventTimestamps.has(session.startTime.toISOString())) {
        skippedCount++;
        console.log(`Skipping existing event at ${session.startTime.toISOString()}`);
        continue;
      }

      const [rawMeasurements, taredMeasurements] = await Promise.all([
        queryRawWeightData(influx, bucket, session.startTime, session.endTime),
        queryTaredWeightData(
          influx,
          bucket,
          session.startTime,
          session.endTime
        ),
      ]);

      if (rawMeasurements.length === 0 || taredMeasurements.length === 0) {
        console.log(
          `Missing measurements for session ${session.startTime.toISOString()} - ${session.endTime.toISOString()}`
        );
        continue;
      }

      // Calculate tare offset using final stable readings
      const sampleCount = 5;
      const finalRaw =
        rawMeasurements.slice(-sampleCount).reduce((sum, m) => sum + m.weight, 0) / sampleCount; // Last 5 samples average
      const finalTared =
        taredMeasurements.slice(-sampleCount).reduce((sum, m) => sum + m.weight, 0) / sampleCount;
      const tareOffset = finalRaw - finalTared;

      // Apply tare to all raw measurements
      const measurements = rawMeasurements.map((m) => ({
        ...m,
        weight: m.weight - tareOffset,
      }));

      console.log(
        `Tare offset: ${tareOffset}g, final tared weight: ${finalTared}g`
      );

      // Determine which cat
      const petId = determinePetId(measurements, catWeights);

      // Calculate basic metrics
      const duration = session.endTime.getTime() - session.startTime.getTime(); // ms
      const eliminationWeight = finalTared; // Will calculate in future pass

      // Query context data for this event
      const contextData = await queryContextData(influx, bucket, session.startTime);

      // Encode raw data with context (our tared weights vs HA tared weights)
      const rawData = encodeRawData(session.startTime, measurements, contextData || undefined);

      events.push({
        pet_id: petId,
        device_id: 1, // Use the seeded "Main Litter Box" device
        timestamp: session.startTime,
        data: {
          type: "litterbox_use",
          elimination_type: "unknown",
          elimination_weight: Math.round(eliminationWeight),
          duration,
        },
        raw_data: rawData,
      });
    }

    // Batch insert events
    console.log(`\n=== Migration Summary ===`);
    console.log(`Sessions found in InfluxDB: ${sessions.length}`);
    console.log(`Events skipped (already exist): ${skippedCount}`);
    console.log(`New events to insert: ${events.length}`);
    
    // First write to JSON file for debugging
    fs.writeFileSync("litterbox_events.json", JSON.stringify(events, null, 2));
    if (events.length === 0) {
      console.log("No new events to insert, skipping database write.");
      return;
    }
    
    console.log(`Inserting ${events.length} new events into database...`);
    await db.insertInto("event").values(events).execute();

    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    // await db.destroy();
  }
}

const startDate = new Date("2025-08-08T00:00:00Z");
const endDate = new Date("2025-08-08T23:59:59Z");
const influxUrl = "http://192.168.100.52:8086";
const influxToken = process.env.INFLUX_TOKEN || "";
const bucket = "homeassistant";
const batchDays = 10;

// migrateEvents(startDate, endDate, influxUrl, influxToken, bucket);

// Process in batches
const start = new Date(startDate);
while (start < endDate) {
  const batchEnd = new Date(
    Math.min(
      start.getTime() + batchDays * 24 * 60 * 60 * 1000,
      endDate.getTime()
    )
  );

  console.log(
    `\n=== Processing batch: ${start.toISOString()} to ${batchEnd.toISOString()} ===`
  );
  await migrateEvents(start, batchEnd, influxUrl, influxToken, bucket);

  start.setTime(batchEnd.getTime());
}
