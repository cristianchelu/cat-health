import { InfluxDB } from "@influxdata/influxdb-client";
import type { Kysely } from "kysely";
import type { Database } from "../../database/index.ts";
import { appConfig } from "./config.ts";
import { CameraEventDownloader } from "./services/CameraDownloader.ts";
import { WeightMeasurementMigrator } from "./migrators/WeightMeasurementMigrator.ts";
import { LitterboxUseMigrator } from "./migrators/LitterboxUseMigrator.ts";
import type { EventMigrator, MediaService, MigratorOptions } from "./types.ts";

export class SyncService {
  private influx: InfluxDB;
  private mediaService: MediaService;
  private migrators: EventMigrator[] = [];
  private db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
    this.influx = new InfluxDB({ 
      url: appConfig.influx.url, 
      token: appConfig.influx.token 
    });

    // Configure the camera downloader with explicit config
    this.mediaService = new CameraEventDownloader({
      ip: appConfig.litterbox.camera.ip!,
      sshUser: appConfig.litterbox.camera.sshUser,
      sshOptions: {
        privateKey: appConfig.litterbox.camera.sshOptions?.privateKey || "",
        password: appConfig.litterbox.camera.sshOptions?.password || ""
      },
      recordingsDir: appConfig.litterbox.camera.recordingsDir,
      // Additional config can be added here as needed
    });
    
    this.setupMigrators();
  }

  private setupMigrators(): void {
    const options: MigratorOptions = {
      db: this.db,
      influx: this.influx,
      mediaService: this.mediaService,
    };

    // Register migrators in order of execution preference
    this.migrators = [
      new WeightMeasurementMigrator(options),
      new LitterboxUseMigrator(options),
      // Future migrators can be added here:
      // new DrinkMigrator(options),
      // new EatMigrator(options),
    ];
  }

  async migrate(
    startDate?: Date, 
    endDate?: Date, 
    migratorNames?: string[]
  ): Promise<void> {
    const start = startDate || appConfig.migration.startDate;
    const end = endDate || appConfig.migration.endDate;
    const batchDays = appConfig.migration.batchDays;

    console.log("=== SyncService Migration Started ===");
    console.log(`Migration period: ${start.toISOString()} to ${end.toISOString()}`);
    console.log(`Batch size: ${batchDays} days`);

    // Process in batches
    const currentStart = new Date(start);
    while (currentStart < end) {
      const batchEnd = new Date(
        Math.min(
          currentStart.getTime() + batchDays * 24 * 60 * 60 * 1000,
          end.getTime()
        )
      );

      console.log(`\n=== Processing batch: ${currentStart.toISOString()} to ${batchEnd.toISOString()} ===`);
      
      // Run migrators in parallel for each batch
      await Promise.all(
        this.migrators.map(migrator => 
          migrator.migrate(currentStart, batchEnd)
        )
      );

      currentStart.setTime(batchEnd.getTime());
    }

    console.log("\n🎉 SyncService migration completed successfully!");
  }

  /**
   * Add a custom migrator
   */
  addMigrator(migrator: EventMigrator): void {
    this.migrators.push(migrator);
  }

  /**
   * Get available migrator names
   */
  getAvailableMigrators(): string[] {
    return this.migrators.map(m => m.name);
  }

  /**
   * Close connections
   */
  async destroy(): Promise<void> {
    // Close any connections that need cleanup
    await this.mediaService.destroy();
  }
}