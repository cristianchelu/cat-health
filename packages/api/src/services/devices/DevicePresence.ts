import type { Kysely } from 'kysely';
import type { DeviceStatus } from 'shared';
import type { Database } from '../../database/index.ts';
import type { DeviceConnectivityEventData } from '../../database/types/EventTable.ts';
import type {
  RecordDeviceEventInput,
  RecordDeviceEventDeps,
} from '../events/recordDeviceEvent.ts';

/** Minimum interval between persisted `last_seen` bumps while status stays unchanged (activity-only). */
const ACTIVITY_PERSIST_THROTTLE_MS = 60_000;

/** Delay before emitting an offline connectivity event (anti-flap). */
const OFFLINE_EVENT_DELAY_MS = 60_000;

export interface DevicePresenceSnapshot {
  status: DeviceStatus;
  lastSeenMs: number | null;
}

export type RecordDeviceEventFn = (
  input: RecordDeviceEventInput,
) => Promise<number>;

export interface DevicePresenceDeps extends RecordDeviceEventDeps {
  recordDeviceEvent: RecordDeviceEventFn;
}

interface PresenceEntry {
  status: DeviceStatus;
  lastSeenMs: number | null;
  /** Wall clock when we last wrote `last_seen` (or full row) for throttle; reset on transition persists. */
  lastActivityPersistedAt: number;
  pendingOfflineTimer?: ReturnType<typeof setTimeout>;
  pendingOfflinePreviousState?: DeviceConnectivityEventData['previous_state'];
}

function normalizeStatus(value: DeviceStatus | null | undefined): DeviceStatus {
  return value ?? 'unknown';
}

function toConnectivityPreviousState(
  status: DeviceStatus,
): DeviceConnectivityEventData['previous_state'] {
  if (status === 'online' || status === 'offline' || status === 'error') {
    return status;
  }
  return 'unknown';
}

/**
 * Singleton push-only presence: transports call report/reportActivity/reportOffline;
 * API reads via getSnapshot (RAM + lazy DB hydrate). Sole writer for `device.last_seen` / `device.status`.
 */
export class DevicePresence {
  private readonly db: Kysely<Database>;
  private readonly recordDeviceEvent: RecordDeviceEventFn;
  private entries = new Map<number, PresenceEntry>();
  private hydrateComplete = false;

  constructor(deps: DevicePresenceDeps) {
    this.db = deps.db;
    this.recordDeviceEvent = deps.recordDeviceEvent;
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

    this.hydrateComplete = true;
  }

  reportOnline(deviceId: number, at: number = Date.now()): void {
    const prev = this.entries.get(deviceId);
    const previousStatus = prev?.status ?? 'unknown';
    const entry: PresenceEntry = {
      status: 'online',
      lastSeenMs: prev?.lastSeenMs != null ? Math.max(prev.lastSeenMs, at) : at,
      lastActivityPersistedAt: prev?.lastActivityPersistedAt ?? 0,
    };
    this.entries.set(deviceId, entry);
    this.clearPendingOfflineEvent(deviceId, entry);
    void this.persistImmediate(deviceId, entry);

    if (previousStatus !== 'online') {
      this.emitConnectivityTransition(deviceId, 'online', previousStatus, at);
    }
  }

  recordActivity(deviceId: number, at: number = Date.now()): void {
    const prev = this.entries.get(deviceId);
    const lastSeenMs =
      prev?.lastSeenMs != null ? Math.max(prev.lastSeenMs, at) : at;
    const previousStatus = prev?.status ?? 'unknown';
    const statusChanged = previousStatus !== 'online';
    const entry: PresenceEntry = {
      status: 'online',
      lastSeenMs,
      lastActivityPersistedAt: prev?.lastActivityPersistedAt ?? 0,
    };
    this.entries.set(deviceId, entry);

    if (statusChanged) {
      this.clearPendingOfflineEvent(deviceId, entry);
      this.emitConnectivityTransition(deviceId, 'online', previousStatus, at);
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
    const previousStatus = prev?.status ?? 'unknown';
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

    if (previousStatus !== 'offline') {
      this.scheduleOfflineConnectivityEvent(
        deviceId,
        entry,
        previousStatus,
        Date.now(),
      );
    }
  }

  reportError(deviceId: number, at: number = Date.now()): void {
    const prev = this.entries.get(deviceId);
    const previousStatus = prev?.status ?? 'unknown';
    const entry: PresenceEntry = {
      status: 'error',
      lastSeenMs: prev?.lastSeenMs ?? at,
      lastActivityPersistedAt: prev?.lastActivityPersistedAt ?? 0,
    };
    this.entries.set(deviceId, entry);
    this.clearPendingOfflineEvent(deviceId, entry);
    void this.persistImmediate(deviceId, entry);

    if (previousStatus !== 'error') {
      this.emitConnectivityTransition(deviceId, 'error', previousStatus, at);
    }
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

  private clearPendingOfflineEvent(
    deviceId: number,
    entry?: PresenceEntry,
  ): void {
    const target = entry ?? this.entries.get(deviceId);
    if (!target?.pendingOfflineTimer) {
      return;
    }

    clearTimeout(target.pendingOfflineTimer);
    target.pendingOfflineTimer = undefined;
    target.pendingOfflinePreviousState = undefined;
  }

  private scheduleOfflineConnectivityEvent(
    deviceId: number,
    entry: PresenceEntry,
    previousStatus: DeviceStatus,
    at: number,
  ): void {
    if (!this.hydrateComplete) {
      return;
    }

    this.clearPendingOfflineEvent(deviceId, entry);

    const previous_state = toConnectivityPreviousState(previousStatus);
    entry.pendingOfflinePreviousState = previous_state;

    entry.pendingOfflineTimer = setTimeout(() => {
      entry.pendingOfflineTimer = undefined;
      entry.pendingOfflinePreviousState = undefined;
      void this.emitConnectivityEvent(deviceId, {
        type: 'device_connectivity',
        state: 'offline',
        previous_state,
      }, at);
    }, OFFLINE_EVENT_DELAY_MS);
  }

  private emitConnectivityTransition(
    deviceId: number,
    state: DeviceConnectivityEventData['state'],
    previousStatus: DeviceStatus,
    at: number,
  ): void {
    if (!this.hydrateComplete) {
      return;
    }

    void this.emitConnectivityEvent(deviceId, {
      type: 'device_connectivity',
      state,
      previous_state: toConnectivityPreviousState(previousStatus),
    }, at);
  }

  private async emitConnectivityEvent(
    deviceId: number,
    data: DeviceConnectivityEventData,
    at: number,
  ): Promise<void> {
    try {
      await this.recordDeviceEvent({
        deviceId,
        timestamp: new Date(at),
        data,
        pet_id: null,
        human_verified: true,
      });
    } catch (err) {
      console.error(
        `DevicePresence: failed to record connectivity event for device ${deviceId}`,
        err,
      );
    }
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
