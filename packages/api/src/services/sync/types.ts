import type { InfluxDB } from '@influxdata/influxdb-client';
import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';

export interface EventMigrator {
  readonly name: string;
  migrate(startDate: Date, endDate: Date): Promise<void>;
}

export interface MediaService {
  downloadVideo(
    startTime: Date,
    endTime: Date,
    eventType: string,
    filename?: string,
  ): Promise<void>;
  captureSnapshot(
    timestamp: Date,
    eventType: string,
    filename?: string,
  ): Promise<void>;
  destroy(): Promise<void>;
}

export interface MigratorOptions {
  db: Kysely<Database>;
  influx: InfluxDB;
  mediaService: MediaService;
}

export interface MigrationStats {
  processed: number;
  skipped: number;
  inserted: number;
  errors: number;
}
