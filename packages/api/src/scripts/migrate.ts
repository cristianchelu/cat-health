import { InfluxDB } from "@influxdata/influxdb-client";
import type { NewEvent } from "../database/types/EventTable.ts";
import { db } from "../database/index.ts";
import { sql } from "kysely";
import { spawn } from "child_process";
import { promisify } from "util";
import { access, constants, mkdir } from "fs";
import path from "path";
import { config } from "dotenv";
import assert from "node:assert";

// Load environment variables from .env file
config();

const accessAsync = promisify(access);
const mkdirAsync = promisify(mkdir);

interface RawMeasurement {
  timestamp: Date;
  weight: number; // in grams
}

interface EventSession {
  startTime: Date;
  endTime: Date;
  measurements: RawMeasurement[];
}

assert(process.env.INFLUX_ORG, "INFLUX_ORG is required in .env");
assert(process.env.INFLUX_URL, "INFLUX_URL is required in .env");
assert(process.env.INFLUX_TOKEN, "INFLUX_TOKEN is required in .env");
assert(process.env.INFLUX_BUCKET, "INFLUX_BUCKET is required in .env");
assert(process.env.MIGRATION_BATCH_DAYS, "MIGRATION_BATCH_DAYS is required in .env");

const env = {
  migrationStartDate: process.env.MIGRATION_START_DATE,
  migrationEndDate: process.env.MIGRATION_END_DATE,
  migrationBatchDays: process.env.MIGRATION_BATCH_DAYS,
  influxOrg: process.env.INFLUX_ORG,
  influxUrl: process.env.INFLUX_URL,
  influxToken: process.env.INFLUX_TOKEN,
  influxBucket: process.env.INFLUX_BUCKET,
  cameraIp: process.env.CAMERA_IP,
} as const;

/** Maintenance threshold for significant weight decrease */
const MAINTENANCE_THRESHOLD = parseInt(process.env.MAINTENANCE_THRESHOLD || "-20");
/** Tared ending weight below which an event is considered `no_elimination` */
const NO_ELIMINATION_THRESHOLD = parseInt(process.env.NO_ELIMINATION_THRESHOLD || "10");
/** Camera configuration - loaded from .env file */
const RECORDINGS_DIR = path.resolve(import.meta.dirname, "../../data/recordings");
const LITTERCAM_SCRIPT = path.resolve(import.meta.dirname, "./littercam.sh");

/** Ensure recordings directory exists */
async function ensureRecordingsDir(): Promise<void> {
  try {
    await accessAsync(RECORDINGS_DIR, constants.F_OK);
  } catch {
    console.log(`Creating recordings directory: ${RECORDINGS_DIR}`);
    await mkdirAsync(RECORDINGS_DIR, { recursive: true });
  }
}

/** Check if a video file already exists for this event */
async function videoFileExists(timestamp: Date, eventType: 'use' | 'maintenance'): Promise<boolean> {
  const filename = `event_${timestamp.toISOString().replace(/[:-]/g, '').replace('T', '_').split('.')[0]}_${eventType}.mp4`;
  const filePath = path.join(RECORDINGS_DIR, filename);
  
  try {
    await accessAsync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Download video for an event using the littercam.sh script */
async function downloadEventVideo(
  startTime: Date,
  endTime: Date,
  eventType: 'use' | 'maintenance'
): Promise<void> {
  if (!env.cameraIp) {
    console.error(`  ❌ CAMERA_IP is not set, skipping video download for event at ${startTime.toISOString()}`);
    return;
  }
  // Check if video already exists
  if (await videoFileExists(startTime, eventType)) {
    console.log(`  Video already exists for event at ${startTime.toISOString()}, skipping download`);
    return;
  }

  // Convert UTC timestamps to camera's local time (UTC+3)
  const CAMERA_TIMEZONE_OFFSET_HOURS = parseInt(process.env.CAMERA_TIMEZONE_OFFSET_HOURS || "3");
  const localStartTime = new Date(startTime.getTime() + CAMERA_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);
  const localEndTime = new Date(endTime.getTime() + CAMERA_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);

  // Format datetime strings for the script (YYYY-MM-DDTHH:MM:SS)
  const startStr = localStartTime.toISOString().split('.')[0];
  const endStr = localEndTime.toISOString().split('.')[0];
  
  // Generate output filename (use UTC time for consistency)
  const filename = `event_${startTime.toISOString().replace(/[:-]/g, '').replace('T', '_').split('.')[0]}_${eventType}.mp4`;
  const outputPath = path.join(RECORDINGS_DIR, filename);
  
  console.log(`  Downloading video: ${startStr} to ${endStr} (camera local time) -> ${filename}`);
  
  return new Promise((resolve, reject) => {
    if (!env.cameraIp) {
      console.error(`  ❌ CAMERA_IP is not set, skipping video download for event at ${startTime.toISOString()}`);
      return;
    }
    const child = spawn('bash', [
      LITTERCAM_SCRIPT,
      env.cameraIp,
      startStr,
      endStr,
      outputPath
    ], {
      cwd: path.dirname(LITTERCAM_SCRIPT),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`  ✅ Video downloaded successfully: ${filename}`);
        resolve();
      } else {
        // Check if the error is due to no files found (common case)
        if (stdout.includes('No files found that overlap with the specified time range') || 
            stdout.includes('No MP4 files found on camera')) {
          console.log(`  ⚠️ No video files found for ${filename} - camera may not have been recording at that time`);
        } else {
          console.error(`  ❌ Video download failed for ${filename}: exit code ${code}`);
          if (stdout) console.error(`  Script output: ${stdout.trim()}`);
          if (stderr) console.error(`  Error output: ${stderr.trim()}`);
        }
        // Don't reject - continue with other events even if video download fails
        resolve();
      }
    });

    child.on('error', (error) => {
      console.error(`  ❌ Failed to execute littercam.sh for ${filename}:`, error.message);
      // Don't reject - continue with other events even if video download fails
      resolve();
    });

    // Set a timeout for video downloads (5 minutes)
    setTimeout(() => {
      child.kill();
      console.error(`  ⚠️ Video download timeout for ${filename}`);
      resolve();
    }, 5 * 60 * 1000);
  });
}

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
  const queryApi = influx.getQueryApi(env.influxOrg);

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
  const queryApi = influx.getQueryApi(env.influxOrg);

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
  const queryApi = influx.getQueryApi(env.influxOrg);

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
  const queryApi = influx.getQueryApi(env.influxOrg);

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
    .where(sql`json_extract(data, '$.type')`, "in", ["litterbox_use", "litterbox_maintenance"])
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
  console.log(`Found ${existingEventTimestamps.size} existing litterbox events (use + maintenance) in time range`);

  // Initialize connections
  const influx = new InfluxDB({ url: influxUrl, token: influxToken });

  // Your cat weights in grams - loaded from .env file
  const catWeightsStr = process.env.CAT_WEIGHTS || "1:6600,2:4300";
  const catWeights: Record<number, number> = {};
  catWeightsStr.split(',').forEach(pair => {
    const [petId, weight] = pair.split(':');
    catWeights[parseInt(petId)] = parseInt(weight);
  });

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
    const eventSessionMap: Map<string, EventSession> = new Map(); // Map event timestamp to session
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

      // Calculate basic metrics
      const duration = session.endTime.getTime() - session.startTime.getTime(); // ms
      const eliminationWeight = finalTared;

      // Query context data for this event
      const contextData = await queryContextData(influx, bucket, session.startTime);

      // Encode raw data with context (our tared weights vs HA tared weights)
      const rawData = encodeRawData(session.startTime, measurements, contextData || undefined);

      if (eliminationWeight < MAINTENANCE_THRESHOLD) {
        // This is a maintenance event (waste removal/scooping)
        console.log(`Detected maintenance event at ${session.startTime.toISOString()}: ${eliminationWeight}g`);
        
        let maintenanceType: "scoop" | "deep_clean" = "scoop";
        
        const eventTimestampKey = session.startTime.toISOString();
        eventSessionMap.set(eventTimestampKey, session);
        
        events.push({
          pet_id: null, // Maintenance events are not assigned to specific pets
          device_id: 1,
          timestamp: session.startTime,
          data: {
            type: "litterbox_maintenance",
            maintenance_type: maintenanceType,
          },
          raw_data: rawData,
          human_verified: false,
        });
      } else {
        // This is a regular litterbox use event
        // Determine which cat based on weight measurements
        const petId = determinePetId(measurements, catWeights);
        
        // Determine elimination type based on ending weight
        let eliminationType: "urination" | "defecation" | "both" | "no_elimination" | "unknown";
        if (eliminationWeight < NO_ELIMINATION_THRESHOLD) {
          eliminationType = "no_elimination";
          console.log(`Marking event at ${session.startTime.toISOString()} as no_elimination (weight: ${eliminationWeight}g)`);
        } else {
          eliminationType = "unknown";
        }
        
        const eventTimestampKey = session.startTime.toISOString();
        eventSessionMap.set(eventTimestampKey, session);
        
        events.push({
          pet_id: petId,
          device_id: 1, // Use the seeded "Main Litter Box" device
          timestamp: session.startTime,
          data: {
            type: "litterbox_use",
            elimination_type: eliminationType,
            elimination_weight: Math.round(Math.max(0, eliminationWeight)), // Ensure non-negative
            duration,
          },
          raw_data: rawData,
          human_verified: false,
        });
      }
    }

    // Batch insert events
    const useEvents = events.filter(e => (e.data as any).type === "litterbox_use");
    const maintenanceEvents = events.filter(e => (e.data as any).type === "litterbox_maintenance");
    
    console.log(`\n=== Migration Summary ===`);
    console.log(`Sessions found in InfluxDB: ${sessions.length}`);
    console.log(`Events skipped (already exist): ${skippedCount}`);
    console.log(`New litterbox use events: ${useEvents.length}`);
    console.log(`New maintenance events detected: ${maintenanceEvents.length}`);
    console.log(`Total events to insert: ${events.length}`);
    
    if (events.length === 0) {
      console.log("No new events to insert, skipping database write.");
    } else {
      console.log(`Inserting ${events.length} new events into database...`);
      await db.insertInto("event").values(events).execute();
      console.log("Events inserted successfully.");
      
      // Download videos for new events if camera IP is configured
      if (env.cameraIp) { // Skip if using default placeholder IP
        console.log(`\n=== Video Download Phase ===`);
        console.log(`Downloading videos for ${events.length} events...`);
        
        // Ensure recordings directory exists
        await ensureRecordingsDir();
        
        // Download videos sequentially to avoid overwhelming the camera
        for (let i = 0; i < events.length; i++) {
          const event = events[i];
          const eventData = event.data as any;
          const eventTimestampKey = event.timestamp.toISOString();
          const session = eventSessionMap.get(eventTimestampKey);
          
          if (session) {
            if (eventData.type === "litterbox_use") {
              await downloadEventVideo(session.startTime, session.endTime, 'use');
            } else if (eventData.type === "litterbox_maintenance") {
              await downloadEventVideo(session.startTime, session.endTime, 'maintenance');
            }
          } else {
            // Fallback to calculated end time if session not found
            if (eventData.type === "litterbox_use") {
              const duration = eventData.duration || 120000; // Default to 2 minutes if duration missing
              const endTime = new Date(event.timestamp.getTime() + duration);
              await downloadEventVideo(event.timestamp, endTime, 'use');
            } else if (eventData.type === "litterbox_maintenance") {
              // For maintenance events, use a fixed 3-minute duration
              const endTime = new Date(event.timestamp.getTime() + 3 * 60 * 1000);
              await downloadEventVideo(event.timestamp, endTime, 'maintenance');
            }
          }
          
          // Progress indicator
          console.log(`  Progress: ${i + 1}/${events.length} videos processed`);
        }
        
        console.log("✅ Video download phase completed.");
      } else {
        console.log("\n⚠️ Skipping video downloads - CAMERA_IP not configured!");
      }
    }
    
    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    // Close database connection
    // await db.destroy();
  }
}

const defaultStartDate = new Date().getTime() - 1 * 24 * 60 * 60 * 1000; // Default to 1 day ago
const migrationStartDate = new Date(env.migrationStartDate || defaultStartDate);
const migrationEndDate = new Date(env.migrationEndDate || Date.now());

console.log("=== Litterbox Event Migration Script ===");
console.log(`Migration period: ${migrationStartDate.toISOString()} to ${migrationEndDate.toISOString()}`);
console.log(`InfluxDB URL: ${env.influxUrl}`);
console.log(`InfluxDB Bucket: ${env.influxBucket}`);
console.log(`InfluxDB Org: ${env.influxOrg}`);
console.log(`Batch size: ${env.migrationBatchDays} days`);
console.log(`Camera IP: ${env.cameraIp}`);
console.log(`Maintenance threshold: ${MAINTENANCE_THRESHOLD}g`);
console.log(`No elimination threshold: ${NO_ELIMINATION_THRESHOLD}g`);
if (!env.cameraIp) {
  console.log("⚠️  Using default camera IP - video downloads will be skipped");
  console.log("   Set CAMERA_IP in .env file to enable video downloads");
}

// Validate thresholds
if (MAINTENANCE_THRESHOLD >= 0) {
  console.error("❌ MAINTENANCE_THRESHOLD should be negative (weight decrease)");
  process.exit(1);
}

if (NO_ELIMINATION_THRESHOLD < 0) {
  console.error("❌ NO_ELIMINATION_THRESHOLD should be positive");
  process.exit(1);
}

console.log();

// Process in batches
async function migrateWeightMeasurements(
  startDate: Date,
  endDate: Date,
  influxUrl: string,
  influxToken: string,
  bucket: string
) {
  console.log(
    `Migrating weight measurements from ${startDate.toISOString()} to ${endDate.toISOString()}`
  );

  // Check for existing weight events in this time range
  console.log("Checking for existing weight events in database...");
  const existingWeightEvents = await db
    .selectFrom("event")
    .select(["timestamp", "pet_id"])
    .where("timestamp", ">=", startDate)
    .where("timestamp", "<=", endDate)
    .where(sql`json_extract(data, '$.type')`, "=", "weight_measurement")
    .execute();

  const existingWeightTimestamps = new Set(
    existingWeightEvents.map(e => `${e.timestamp.toISOString()}-${e.pet_id}`)
  );
  console.log(`Found ${existingWeightEvents.length} existing weight measurements in time range`);

  const influx = new InfluxDB({ url: influxUrl, token: influxToken });

  // Pet mappings based on sensor names - loaded from .env file
  const petSensorMappingsStr = process.env.PET_SENSOR_MAPPINGS || "Litterbox Jazz Weight:1,Litterbox Luna Weight:2";
  const petSensorMappings: Record<string, number> = {};
  petSensorMappingsStr.split(',').forEach(pair => {
    const [sensorName, petId] = pair.split(':');
    petSensorMappings[sensorName.trim()] = parseInt(petId);
  });

  try {
    const events: NewEvent[] = [];
    let skippedCount = 0;

    for (const [sensorName, petId] of Object.entries(petSensorMappings)) {
      console.log(`\nProcessing ${sensorName} for pet ${petId}...`);
      
      const queryApi = influx.getQueryApi(env.influxOrg);
      
      // Query all individual weight measurements - data is already pre-processed and validated
      const weightQuery = `
        from(bucket: "${bucket}")
          |> range(start: ${startDate.toISOString()}, stop: ${endDate.toISOString()})
          |> filter(fn: (r) => r["friendly_name"] == "${sensorName}")
          |> filter(fn: (r) => r["_field"] == "value")
          |> sort(columns: ["_time"])
          |> yield(name: "individual_weights")
      `;

      const measurements: Array<{ timestamp: Date; weight: number }> = [];

      await new Promise<void>((resolve, reject) => {
        queryApi.queryRows(weightQuery, {
          next: (row, tableMeta) => {
            const obj = tableMeta.toObject(row);
            measurements.push({
              timestamp: new Date(obj._time),
              weight: obj._value * 1000, // Convert kg to grams
            });
          },
          error: reject,
          complete: () => resolve(),
        });
      });

      console.log(`Found ${measurements.length} individual weight measurements for ${sensorName}`);

      // Create weight measurement events
      for (const measurement of measurements) {
        const timestampKey = `${measurement.timestamp.toISOString()}-${petId}`;
        
        if (existingWeightTimestamps.has(timestampKey)) {
          skippedCount++;
          continue;
        }

        events.push({
          pet_id: petId,
          device_id: 1, // Main Litter Box device
          timestamp: measurement.timestamp,
          data: {
            type: "weight_measurement",
            weight: Math.round(measurement.weight),
          },
          raw_data: null, // No raw data for weight measurements
          human_verified: false,
        });
      }
    }

    console.log(`\n=== Weight Migration Summary ===`);
    console.log(`Weight events skipped (already exist): ${skippedCount}`);
    console.log(`New individual weight measurement events: ${events.length}`);
    
    if (events.length === 0) {
      console.log("No new weight events to insert, skipping database write.");
    } else {
      console.log(`Inserting ${events.length} new weight measurement events into database...`);
      await db.insertInto("event").values(events).execute();
    }
    
    console.log("Weight migration completed successfully");
  } catch (error) {
    console.error("Weight migration failed:", error);
  }
}

// Main execution function
async function main() {
  const start = new Date(migrationStartDate);
  const batchDays = parseInt(env.migrationBatchDays);

  while (start < migrationEndDate) {
    const batchEnd = new Date(
      Math.min(
        start.getTime() + batchDays * 24 * 60 * 60 * 1000,
        migrationEndDate.getTime()
      )
    );

    console.log(
      `\n=== Processing batch: ${start.toISOString()} to ${batchEnd.toISOString()} ===`
    );
    
    // Run both migrations in parallel
    await Promise.all([
      migrateEvents(start, batchEnd, env.influxUrl, env.influxToken, env.influxBucket),
      migrateWeightMeasurements(start, batchEnd, env.influxUrl, env.influxToken, env.influxBucket)
    ]);

    start.setTime(batchEnd.getTime());
  }

  console.log("\n🎉 All batches completed successfully!");
}

// Run the main function and handle errors
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Migration script failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await db.destroy();
    } catch (error) {
      console.error("Error closing database:", error);
    }
  });
