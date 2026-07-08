import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { SerializePlugin } from 'kysely-plugin-serialize';

import type { PetTable } from './types/PetTable.ts';
import type { EventTable } from './types/EventTable.ts';
import type { DeviceTable } from './types/DeviceTable.ts';
import type { MediaTable } from './types/MediaTable.ts';
import type { MediaLinkTable } from './types/MediaLinkTable.ts';
import type { ProviderAccountTable } from './types/ProviderAccountTable.ts';
import type { DeviceCameraTable } from './types/DeviceCameraTable.ts';
import type { FoodTable } from './types/FoodTable.ts';
import type { AppSettingTable } from './types/AppSettingTable.ts';

export interface Database {
  pet: PetTable;
  event: EventTable;
  device: DeviceTable;
  media: MediaTable;
  media_link: MediaLinkTable;
  provider_account: ProviderAccountTable;
  device_camera: DeviceCameraTable;
  food: FoodTable;
  app_setting: AppSettingTable;
}

function getDefaultDbPath(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return resolve(dir, '..', '..', '..', '..', 'data', 'database.sqlite');
}

export function createDb(path?: string): Kysely<Database> {
  const dbPath = path ?? process.env.SQLITE_PATH ?? getDefaultDbPath();
  return new Kysely<Database>({
    dialect: new SqliteDialect({
      database: new SQLite(dbPath, { readonly: false, fileMustExist: false }),
    }),
    plugins: [new SerializePlugin()],
  });
}

let _db: Kysely<Database> | undefined;

/** Lazy singleton for scripts (seed, backup, migrate CLI). */
export function getDb(): Kysely<Database> {
  return (_db ??= createDb());
}
