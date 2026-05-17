import type { Kysely } from 'kysely';
import type { DeviceStatus } from 'shared';
import type { Database } from '../../database/index.ts';

/** Minimum interval between persisted `last_seen` bumps while status stays unchanged (activity-only). */
const ACTIVITY_PERSIST_THROTTLE_MS = 60_000;

export interface DevicePresenceSnapshot {
  status: DeviceStatus;
  lastSeenMs: number | null;
}

interface PresenceEntry {
  status: DeviceStatus;
  lastSeenMs: number | null;
  /** Wall clock when we last wrote `last_seen` (or full row) for throttle; reset on transition persists. */
  lastActivityPersistedAt: number;
}

function normalizeStatus(value: DeviceStatus | null | undefined): DeviceStatus {
  return value ?? 'unknown';
}

/**
 * Singleton push-only presence: transports call report/reportActivity/reportOffline;
 * API reads via getSnapshot (RAM + lazy DB hydrate). Sole writer for `device.last_seen` / `device.status`.
 */
export class DevicePresence {
  private readonly db: Kysely<Database>;
  private entries = new Map<number, PresenceEntry>();

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  /** Load persisted columns into RAM before adapters connect (startup). */
  async hydrateAll(): Promise<void> {
    const rows = await this.db
      .selectFrom('device')
      .select(['id', 'last_seen', 'status'])
      .execute();

    const now = Date.now();
    for (const row of rows) {
      this.entries.set(row.id, {
        status: normalizeStatus(row.status ?? undefined),
        lastSeenMs: row.last_seen,
        lastActivityPersistedAt: now,
      });
    }
  }

  reportOnline(deviceId: number, at: number = Date.now()): void {
    const prev = this.entries.get(deviceId);
    const entry: PresenceEntry = {
      status: 'online',
      lastSeenMs: prev?.lastSeenMs != null ? Math.max(prev.lastSeenMs, at) : at,
      lastActivityPersistedAt: prev?.lastActivityPersistedAt ?? 0,
    };
    this.entries.set(deviceId, entry);
    void this.persistImmediate(deviceId, entry);
  }

  recordActivity(deviceId: number, at: number = Date.now()): void {
    const prev = this.entries.get(deviceId);
    const lastSeenMs =
      prev?.lastSeenMs != null ? Math.max(prev.lastSeenMs, at) : at;
    const prevStatus = prev?.status ?? 'unknown';
    const status: DeviceStatus = 'online';
    const statusChanged = prevStatus !== 'online';
    const entry: PresenceEntry = {
      status,
      lastSeenMs,
      lastActivityPersistedAt: prev?.lastActivityPersistedAt ?? 0,
    };
    this.entries.set(deviceId, entry);
    if (statusChanged) {
      void this.persistImmediate(deviceId, entry);
    } else {
      void this.maybeThrottlePersistActivity(deviceId, entry);
    }
  }

  reportOffline(
    deviceId: number,
    opts?: { lastActivityMs?: number | null },
  ): void {
    const prev = this.entries.get(deviceId);
    const lastSeenMs =
      opts?.lastActivityMs !== undefined && opts.lastActivityMs !== null
        ? opts.lastActivityMs
        : prev?.lastSeenMs ?? null;
    const entry: PresenceEntry = {
      status: 'offline',
      lastSeenMs,
      lastActivityPersistedAt: prev?.lastActivityPersistedAt ?? 0,
    };
    this.entries.set(deviceId, entry);
    void this.persistImmediate(deviceId, entry);
  }

  reportError(deviceId: number, at: number = Date.now()): void {
    const prev = this.entries.get(deviceId);
    const entry: PresenceEntry = {
      status: 'error',
      lastSeenMs: prev?.lastSeenMs ?? at,
      lastActivityPersistedAt: prev?.lastActivityPersistedAt ?? 0,
    };
    this.entries.set(deviceId, entry);
    void this.persistImmediate(deviceId, entry);
  }

  async getSnapshot(deviceId: number): Promise<DevicePresenceSnapshot> {
    const mem = this.entries.get(deviceId);
    if (mem) {
      return { status: mem.status, lastSeenMs: mem.lastSeenMs };
    }

    const row = await this.db
      .selectFrom('device')
      .select(['last_seen', 'status'])
      .where('id', '=', deviceId)
      .executeTakeFirst();

    const snap: DevicePresenceSnapshot = {
      status: normalizeStatus(row?.status ?? undefined),
      lastSeenMs: row?.last_seen ?? null,
    };

    if (row !== undefined) {
      this.entries.set(deviceId, {
        status: snap.status,
        lastSeenMs: snap.lastSeenMs,
        lastActivityPersistedAt: Date.now(),
      });
    }

    return snap;
  }

  private async persistImmediate(
    deviceId: number,
    entry: PresenceEntry,
  ): Promise<void> {
    try {
      await this.db
        .updateTable('device')
        .set({
          last_seen: entry.lastSeenMs,
          status: entry.status,
          updated_at: Date.now(),
        })
        .where('id', '=', deviceId)
        .execute();
      entry.lastActivityPersistedAt = Date.now();
    } catch (err) {
      console.error(`DevicePresence: persist failed for device ${deviceId}`, err);
    }
  }

  private async maybeThrottlePersistActivity(
    deviceId: number,
    entry: PresenceEntry,
  ): Promise<void> {
    const now = Date.now();
    if (now - entry.lastActivityPersistedAt < ACTIVITY_PERSIST_THROTTLE_MS) {
      return;
    }
    await this.persistImmediate(deviceId, entry);
  }
}
