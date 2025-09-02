import { sql } from "kysely";
import type { NewEvent } from "../../../database/types/EventTable.ts";
import { appConfig } from "../config.ts";
import type { EventMigrator, MigratorOptions, MigrationStats } from "../types.ts";

interface EventSession {
  startTime: Date;
  endTime: Date;
}

export class WaterIntakeMigrator implements EventMigrator {
  readonly name = "WaterIntakeMigrator";
  private options: MigratorOptions;

  constructor(options: MigratorOptions) {
    this.options = options;
  }

  async migrate(startDate: Date, endDate: Date): Promise<void> {
    console.log(`\n=== ${this.name} Migration ===`);
    console.log(`Processing water intake events from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const stats: MigrationStats = { processed: 0, skipped: 0, inserted: 0, errors: 0 };

    try {
      // Check for existing water intake events
      const existingEvents = await this.getExistingWaterIntakeEvents(startDate, endDate);
      console.log(`Found ${existingEvents.size} existing water intake events in time range`);

      // Get event sessions from InfluxDB
      const sessions = await this.queryInfluxForEventSessions(startDate, endDate);
      console.log(`Found ${sessions.length} water intake sessions`);
      stats.processed = sessions.length;

      const newEvents: NewEvent[] = [];

      for (const session of sessions) {
        // Skip if this event timestamp already exists
        if (existingEvents.has(session.startTime.toISOString())) {
          stats.skipped++;
          console.log(`Skipping existing event at ${session.startTime.toISOString()}`);
          continue;
        }

        const processedEvent = await this.processEventSession(session);
        if (processedEvent) {
          newEvents.push(processedEvent);
        }
      }

      // Batch insert new events
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
    const existingEvents = await this.options.db
      .selectFrom("event")
      .select(["timestamp"])
      .where("timestamp", ">=", startDate)
      .where("timestamp", "<=", endDate)
      .where(sql`json_extract(data, '$.type')`, "=", "water_intake")
      .execute();

    return new Set(existingEvents.map(e => e.timestamp.toISOString()));
  }

  private async queryInfluxForEventSessions(startDate: Date, endDate: Date): Promise<EventSession[]> {
    const queryApi = this.options.influx.getQueryApi(appConfig.influx.org);

    // Get water fountain activity sensor state changes
    const activityQuery = `
      from(bucket: "${appConfig.influx.bucket}")
        |> range(start: ${startDate.toISOString()}, stop: ${endDate.toISOString()})
        |> filter(fn: (r) => r["friendly_name"] == "PetLibro PLWF105 Before event")
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
            if (event.value !== 0 && currentStart === null) {
              // Activity started (non-0 value)
              currentStart = event.timestamp;
            } else if (event.value === 0 && currentStart !== null) {
              // Activity ended (back to 0)
              const duration = event.timestamp.getTime() - currentStart.getTime();
              if (duration > 5000) { // At least 5 seconds
                sessions.push({
                  startTime: currentStart,
                  endTime: event.timestamp,
                });
              } else {
                console.warn(
                  `Ignoring short water intake session at ${event.timestamp.toISOString()} (${duration}ms)`
                );
              }
              currentStart = null;
            }
          }

          // Handle case where last event didn't have an end
          if (currentStart !== null) {
            console.warn(
              `Found water intake start at ${currentStart.toISOString()} without corresponding end`
            );
          }

          console.log(
            `Parsed ${sessions.length} water intake sessions from ${activityEvents.length} state changes`
          );
          resolve(sessions);
        },
      });
    });
  }

  private async processEventSession(session: EventSession): Promise<NewEvent | null> {
    try {
      // Calculate session duration
      const duration = session.endTime.getTime() - session.startTime.getTime();

      // Get the actual drink amount from InfluxDB
      const actualAmount = await this.queryDrinkAmount(session.endTime);

      if (actualAmount === null) {
        console.log(`No drink amount found for session at ${session.startTime.toISOString()}, skipping`);
        return null;
      }

      console.log(`Water intake session at ${session.startTime.toISOString()}: ${duration}ms duration, ${actualAmount}ml consumed`);

      // Create water intake event
      return {
        pet_id: null, // Unknown pet for now - will be determined by camera analysis later
        device_id: 2, // Water fountain device (manually inserted)
        timestamp: session.startTime,
        data: {
          type: "water_intake",
          amount: actualAmount,
        },
        raw_data: this.encodeRawData(session.startTime, duration, actualAmount),
        human_verified: false,
      };
    } catch (error) {
      console.error(`Error processing water intake session at ${session.startTime.toISOString()}:`, error);
      return null;
    }
  }

  private async queryDrinkAmount(endTime: Date): Promise<number | null> {
    const queryApi = this.options.influx.getQueryApi(appConfig.influx.org);

    // Query the drink amount that was recorded after the event finished
    // Look for the measurement within a few minutes after the event end
    const searchEndTime = new Date(endTime.getTime() + 5 * 60 * 1000); // 5 minutes after event end

    const amountQuery = `
      from(bucket: "${appConfig.influx.bucket}")
        |> range(start: ${endTime.toISOString()}, stop: ${searchEndTime.toISOString()})
        |> filter(fn: (r) => r["friendly_name"] == "PetLibro PLWF105 Last Drink Amount ml")
        |> filter(fn: (r) => r["_field"] == "value")
        |> first()
        |> yield(name: "amount")
    `;

    return new Promise((resolve, reject) => {
      let foundAmount: number | null = null;

      queryApi.queryRows(amountQuery, {
        next: (row, tableMeta) => {
          const obj = tableMeta.toObject(row);
          foundAmount = obj._value;
        },
        error: reject,
        complete: () => {
          resolve(foundAmount);
        },
      });
    });
  }

  private encodeRawData(startTime: Date, duration: number, amount: number): Buffer {
    // Binary encoding: [version:1byte][startTimestamp:8bytes][duration:4bytes][amount:4bytes]
    const version = 1;
    const buffer = Buffer.allocUnsafe(1 + 8 + 4 + 4);

    let offset = 0;
    buffer.writeUInt8(version, offset);
    offset += 1;

    buffer.writeBigUInt64BE(BigInt(startTime.getTime()), offset);
    offset += 8;

    buffer.writeUInt32BE(duration, offset);
    offset += 4;

    // Store amount in ml (as float32)
    buffer.writeFloatBE(amount, offset);
    offset += 4;

    return buffer;
  }

  private logStats(stats: MigrationStats): void {
    console.log(`\n=== ${this.name} Stats ===`);
    console.log(`Sessions processed: ${stats.processed}`);
    console.log(`Events skipped (existing): ${stats.skipped}`);
    console.log(`New water intake events: ${stats.inserted}`);
    console.log(`Errors: ${stats.errors}`);
  }
}
