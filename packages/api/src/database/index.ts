import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { SerializePlugin } from "kysely-plugin-serialize";

import type { PetTable } from "./types/PetTable.ts";
import type { EventTable } from "./types/EventTable.ts";
import type { DeviceTable } from "./types/DeviceTable.ts";

export interface Database {
  pet: PetTable;
  event: EventTable;
  device: DeviceTable;
}

const dir = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SQLITE_PATH ?? resolve(dir, "..", "..", "..", "..", "data", "database.sqlite");

export const dialect = new SqliteDialect({
  database: new SQLite(dbPath, { readonly: false, fileMustExist: false }),
});

export const db = new Kysely<Database>({
  dialect,
  plugins: [new SerializePlugin()],
});
