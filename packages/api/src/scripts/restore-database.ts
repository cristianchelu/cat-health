import { access, copyFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const dbPath =
  process.env.SQLITE_PATH ??
  resolve(dir, "..", "..", "..", "..", "data", "database.sqlite");

const backupArg = process.argv[2];
if (!backupArg) {
  console.error(
    "Usage: npm run restore-db -- <path-to-backup.bak.sqlite>\n" +
      "Example: npm run restore-db -- data/database.20260416T120000.bak.sqlite\n" +
      "Stop the API (and anything else using this DB) first.",
  );
  process.exit(1);
}

const sourcePath = resolve(process.cwd(), backupArg);
try {
  await access(sourcePath);
} catch {
  console.error(`Backup file not found or not readable: ${sourcePath}`);
  process.exit(1);
}

const dataDir = dirname(dbPath);
const tempPath = resolve(dataDir, `.database.restore.${process.pid}.tmp.sqlite`);

await copyFile(sourcePath, tempPath);

const walPath = `${dbPath}-wal`;
const shmPath = `${dbPath}-shm`;
for (const sidecar of [walPath, shmPath]) {
  try {
    await unlink(sidecar);
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") throw e;
  }
}

await rename(tempPath, dbPath);

console.log(`Restored ${sourcePath} -> ${dbPath}`);
