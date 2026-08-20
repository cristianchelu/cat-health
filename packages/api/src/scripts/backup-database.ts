import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { format } from 'date-fns';

const dir = dirname(fileURLToPath(import.meta.url));
const dbPath =
  process.env.SQLITE_PATH ??
  resolve(dir, '..', '..', '..', '..', 'data', 'database.sqlite');

const stamp = format(new Date(), "yyyyMMdd'T'HHmmss");
const backupPath = resolve(dirname(dbPath), `database.${stamp}.bak.sqlite`);

const db = new Database(dbPath, { readonly: true });
await db.backup(backupPath);
db.close();

console.log(backupPath);
