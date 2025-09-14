import { sql } from "kysely";
import type { NewEvent } from "../../../database/types/EventTable.ts";
import { appConfig } from "../config.ts";
import type { EventMigrator, MigratorOptions, MigrationStats } from "../types.ts";

// Define an interface for the shape of the data returned by our Flux query
interface InfluxDrinkRecord {
  _time: string; // ISO timestamp string for the end of the event
  amount: number; // in ml
  duration: number; // in seconds
}

// Define an interface for the processed drink event
interface DrinkEvent {
  startTime: Date;
  endTime: Date;
  amount: number; // in ml
  duration: number;
}

export class WaterIntakeMigrator implements EventMigrator {
  readonly name = "WaterIntakeMigrator";
  private options: MigratorOptions;

  // Use constants for friendly names to avoid typos and for easier updates
  private static readonly DRINK_AMOUNT_FRIENDLY_NAME = "PetLibro PLWF105 Last drink amount";
  private static readonly DRINK_DURATION_FRIENDLY_NAME = "PetLibro PLWF105 Last drink duration";
  private static readonly MIN_EVENT_DURATION_MS = 1000; // 1 second

  constructor(options: MigratorOptions) {
    this.options = options;
  }

  async migrate(startDate: Date, endDate: Date): Promise<void> {
    console.log(`\n=== ${this.name} Migration ===`);
    console.log(`Processing water intake events from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const stats: MigrationStats = { processed: 0, skipped: 0, inserted: 0, errors: 0 };

    try {
      // 1. Get existing events from our DB to prevent duplicates
      const existingEvents = await this.getExistingWaterIntakeEvents(startDate, endDate);
      console.log(`Found ${existingEvents.size} existing water intake events in time range.`);

      // 2. Get all completed drink events from InfluxDB in one query
      const drinkEvents = await this.getDrinkEventsFromInflux(startDate, endDate);
      stats.processed = drinkEvents.length;
      console.log(`Found ${drinkEvents.length} completed drink events from InfluxDB.`);

      const newEvents: NewEvent[] = [];
      for (const drink of drinkEvents) {
        // Skip if this event timestamp already exists
        if (existingEvents.has(drink.startTime.toISOString())) {
          stats.skipped++;
          continue;
        }

        const newDbEvent = this.createDbEvent(drink);
        newEvents.push(newDbEvent);
        console.log(`Prepared new event at ${drink.startTime.toISOString()}: ${drink.duration}ms, ${drink.amount}ml`);
      }

      // 3. Batch insert new events
      if (newEvents.length > 0) {
        console.log(`Inserting ${newEvents.length} new water intake events...`);
        await this.options.db.insertInto("event").values(newEvents).execute();
        stats.inserted = newEvents.length;
      } else {
        console.log("No new water intake events to insert.");
      }

      this.logStats(stats);
    } catch (error) {
      console.error(`${this.name} migration failed:`, error);
      stats.errors++;
      throw error;
    }
  }

  private async getExistingWaterIntakeEvents(startDate: Date, endDate: Date): Promise<Set<string>> {
    const results = await this.options.db
      .selectFrom("event")
      .select(["timestamp"])
      .where("timestamp", ">=", startDate)
      .where("timestamp", "<=", endDate)
      .where(sql`json_extract(data, '$.type')`, "=", "water_intake")
      .execute();

    // Use a Set for efficient O(1) lookups
    return new Set(results.map(e => e.timestamp.toISOString()));
  }

  private async getDrinkEventsFromInflux(startDate: Date, endDate: Date): Promise<DrinkEvent[]> {
    const queryApi = this.options.influx.getQueryApi(appConfig.influx.org);

    // This query uses `aggregateWindow` to group related amount/duration events
    // that have slightly different timestamps.
    const fluxQuery = `
      // A window of a few seconds is usually safe to catch both events from the device.
      // You can adjust this if needed.
      windowPeriod = 5s

      from(bucket: "${appConfig.influx.bucket}")
        |> range(start: ${startDate.toISOString()}, stop: ${endDate.toISOString()})
        |> filter(fn: (r) =>
            r["friendly_name"] == "${WaterIntakeMigrator.DRINK_AMOUNT_FRIENDLY_NAME}" or
            r["friendly_name"] == "${WaterIntakeMigrator.DRINK_DURATION_FRIENDLY_NAME}"
        )
        |> filter(fn: (r) => r["_field"] == "value")

        // === START: The key change is here ===
        // Group records into windows (e.g., 5 seconds). Since the amount and duration
        // are recorded milliseconds apart, this puts them in the same bucket.
        |> aggregateWindow(every: windowPeriod, fn: last, createEmpty: false)
        // aW() adds a suffix to the column name, so we must remove it.
        |> rename(columns: {"_value": "value"})

        // Now we can use the technique from before.
        // Map the long friendly_name to a simple identifier.
        |> map(fn: (r) => ({
            r with
            simple_key: if r.friendly_name == "${WaterIntakeMigrator.DRINK_AMOUNT_FRIENDLY_NAME}" then "amount" else "duration"
        }))
        // Pivot on the new 'simple_key'. Because of aggregateWindow, the timestamps for
        // amount and duration now match, so they will pivot into the same row.
        |> group()
        |> pivot(
            rowKey:["_time"],
            columnKey: ["simple_key"],
            valueColumn: "value"
        )
        // === END: Change complete ===

        // This filter will now work correctly.
        |> filter(fn: (r) => exists r.amount and exists r.duration)
        
    `;
    console.log(fluxQuery);

    const records = await queryApi.collectRows<InfluxDrinkRecord>(fluxQuery);

    // This processing logic remains the same.
    return records
      .map(record => {
        const endTime = new Date(record._time);
        // The duration from the sensor is in seconds, convert to milliseconds
        const durationMs = Math.round(record.duration * 1000);
        const startTime = new Date(endTime.getTime() - durationMs);

        return {
          startTime,
          endTime,
          amount: record.amount,
          duration: record.duration,
        };
      })
      .filter(event => event.duration >= WaterIntakeMigrator.MIN_EVENT_DURATION_MS);
  }

  private createDbEvent(drink: DrinkEvent): NewEvent {
    // This is now a simple, synchronous transformation function.
    return {
      pet_id: null, // To be determined later
      device_id: 2, // Water fountain device
      timestamp: drink.startTime,
      data: {
        type: "water_intake",
        amount: drink.amount,
        duration: drink.duration
      },
      human_verified: false,
    };
  }

  private logStats(stats: MigrationStats): void {
    console.log(`\n=== ${this.name} Stats ===`);
    console.log(`Events processed: ${stats.processed}`);
    console.log(`Events skipped (existing): ${stats.skipped}`);
    console.log(`New events inserted: ${stats.inserted}`);
    console.log(`Errors: ${stats.errors}`);
  }
}