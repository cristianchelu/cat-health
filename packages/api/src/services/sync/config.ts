import { config } from "dotenv";
import assert from "node:assert";
import path from "path";

// Load environment variables from .env file
config();

// Assert that required variables are defined
assert(process.env.INFLUX_ORG, "INFLUX_ORG is required in .env");
assert(process.env.INFLUX_URL, "INFLUX_URL is required in .env");
assert(process.env.INFLUX_TOKEN, "INFLUX_TOKEN is required in .env");
assert(process.env.INFLUX_BUCKET, "INFLUX_BUCKET is required in .env");
assert(process.env.MIGRATION_BATCH_DAYS, "MIGRATION_BATCH_DAYS is required in .env");
assert(process.env.CAT_WEIGHTS, "CAT_WEIGHTS is required in .env");
assert(process.env.PET_SENSOR_MAPPINGS, "PET_SENSOR_MAPPINGS is required in .env");

// Validate thresholds
const MAINTENANCE_THRESHOLD = parseInt(process.env.MAINTENANCE_THRESHOLD || "-20");
const NO_ELIMINATION_THRESHOLD = parseInt(process.env.NO_ELIMINATION_THRESHOLD || "10");

assert(MAINTENANCE_THRESHOLD < 0, "MAINTENANCE_THRESHOLD should be a negative number.");
assert(NO_ELIMINATION_THRESHOLD >= 0, "NO_ELIMINATION_THRESHOLD should be a non-negative number.");

export const appConfig = {
  // General Migration Settings
  migration: {
    startDate: new Date(process.env.MIGRATION_START_DATE || Date.now() - 48 * 60 * 60 * 1000),
    endDate: new Date(process.env.MIGRATION_END_DATE || Date.now()),
    batchDays: parseInt(process.env.MIGRATION_BATCH_DAYS),
  },

  // InfluxDB Connection
  influx: {
    url: process.env.INFLUX_URL,
    token: process.env.INFLUX_TOKEN,
    org: process.env.INFLUX_ORG,
    bucket: process.env.INFLUX_BUCKET,
  },

  // Event-specific Configurations
  litterbox: {
    maintenanceThreshold: MAINTENANCE_THRESHOLD,
    noEliminationThreshold: NO_ELIMINATION_THRESHOLD,
    catWeights: (process.env.CAT_WEIGHTS)
      .split(',')
      .reduce((acc, pair) => {
        const [petId, weight] = pair.split(':');
        acc[parseInt(petId)] = parseInt(weight);
        return acc;
      }, {} as Record<number, number>),
    camera: {
      ip: process.env.LITTERBOX_CAMERA_IP, // Using a more specific name
      timezoneOffsetHours: parseInt(process.env.CAMERA_TIMEZONE_OFFSET_HOURS || "3"),
      recordingsDir: path.resolve(import.meta.dirname, "../../../data/recordings"),
      sshUser: process.env.LITTERBOX_CAMERA_SSH_USER || "root",
      sshOptions: {
        privateKey: process.env.LITTERBOX_CAMERA_SSH_PRIVATE_KEY,
        password: process.env.LITTERBOX_CAMERA_SSH_PASSWORD
      }
    }
  },

  weight: {
     petSensorMappings: (process.env.PET_SENSOR_MAPPINGS)
      .split(',')
      .reduce((acc, pair) => {
        const [sensorName, petId] = pair.split(':');
        acc[sensorName.trim()] = parseInt(petId);
        return acc;
      }, {} as Record<string, number>),
  },
} as const;