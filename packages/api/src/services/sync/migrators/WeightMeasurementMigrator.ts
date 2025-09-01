import { sql } from "kysely";
import type { NewEvent } from "../../../database/types/EventTable.ts";
import { appConfig } from "../config.ts";
import type { EventMigrator, MigratorOptions, MigrationStats } from "../types.ts";

interface WeightMeasurement {
  timestamp: Date;
  weight: number;
}

export class WeightMeasurementMigrator implements EventMigrator {
  readonly name = "WeightMeasurementMigrator";
  private options: MigratorOptions;

  constructor(options: MigratorOptions) {
    this.options = options;
  }

  async migrate(startDate: Date, endDate: Date): Promise<void> {
    console.log(`\n=== ${this.name} Migration ===`);
    console.log(`Processing weight measurements from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const stats: MigrationStats = { processed: 0, skipped: 0, inserted: 0, errors: 0 };

    try {
      // Check for existing weight events
      const existingEvents = await this.getExistingWeightEvents(startDate, endDate);
      console.log(`Found ${existingEvents.size} existing weight measurements in time range`);

      const newEvents: NewEvent[] = [];

      // Process each pet sensor mapping
      for (const [sensorName, petId] of Object.entries(appConfig.weight.petSensorMappings)) {
        console.log(`\nProcessing ${sensorName} for pet ${petId}...`);
        
        const measurements = await this.queryWeightMeasurements(sensorName, startDate, endDate);
        console.log(`Found ${measurements.length} measurements for ${sensorName}`);
        stats.processed += measurements.length;

        for (const measurement of measurements) {
          const timestampKey = `${measurement.timestamp.toISOString()}-${petId}`;
          
          if (existingEvents.has(timestampKey)) {
            stats.skipped++;
            continue;
          }

          newEvents.push(this.createWeightEvent(measurement, petId));
        }
      }

      // Batch insert new events
      if (newEvents.length > 0) {
        console.log(`Inserting ${newEvents.length} new weight measurement events...`);
        await this.options.db.insertInto("event").values(newEvents).execute();
        stats.inserted = newEvents.length;
      } else {
        console.log("No new weight events to insert.");
      }

      this.logStats(stats);
    } catch (error) {
      console.error(`${this.name} migration failed:`, error);
      stats.errors++;
      throw error;
    }
  }

  private async getExistingWeightEvents(startDate: Date, endDate: Date): Promise<Set<string>> {
    const existingEvents = await this.options.db
      .selectFrom("event")
      .select(["timestamp", "pet_id"])
      .where("timestamp", ">=", startDate)
      .where("timestamp", "<=", endDate)
      .where(sql`json_extract(data, '$.type')`, "=", "weight_measurement")
      .execute();

    return new Set(
      existingEvents.map(e => `${e.timestamp.toISOString()}-${e.pet_id}`)
    );
  }

  private async queryWeightMeasurements(
    sensorName: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<WeightMeasurement[]> {
    const queryApi = this.options.influx.getQueryApi(appConfig.influx.org);
    
    const weightQuery = `
      from(bucket: "${appConfig.influx.bucket}")
        |> range(start: ${startDate.toISOString()}, stop: ${endDate.toISOString()})
        |> filter(fn: (r) => r["friendly_name"] == "${sensorName}")
        |> filter(fn: (r) => r["_field"] == "value")
        |> sort(columns: ["_time"])
        |> yield(name: "individual_weights")
    `;

    const measurements: WeightMeasurement[] = [];

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
        complete: () => resolve(measurements),
      });
    });
  }

  private createWeightEvent(measurement: WeightMeasurement, petId: number): NewEvent {
    return {
      pet_id: petId,
      device_id: 1, // Main Litter Box device
      timestamp: measurement.timestamp,
      data: {
        type: "weight_measurement",
        weight: Math.round(measurement.weight),
      },
      raw_data: null, // No raw data for weight measurements
      human_verified: false,
    };
  }

  private logStats(stats: MigrationStats): void {
    console.log(`\n=== ${this.name} Stats ===`);
    console.log(`Measurements processed: ${stats.processed}`);
    console.log(`Events skipped (existing): ${stats.skipped}`);
    console.log(`New events inserted: ${stats.inserted}`);
    console.log(`Errors: ${stats.errors}`);
  }
}
