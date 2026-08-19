import type { Kysely } from 'kysely';
import type { DeviceStatus } from 'shared';
import type { Database } from '../../database/index.ts';
import type { DeviceConnectivityEventData } from '../../domain/events.ts';
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
  /**
   * Armed anti-flap timers, keyed by device rather than held on the entry:
   * every report replaces the entry, so a timer stored there is orphaned by
   * the next one and can no longer be cancelled.
   */
  private pendingOfflineTimers = new Map<
    number,
    ReturnType<typeof setTimeout>
  >();
  /**
   * Devices we deliberately stopped watching, held until `resume` because a
   * teardown reports offline more than once. Suppresses event emission only;
   * status still persists, since "offline" is the honest answer for a device
   * nobody is dialling.
   *
   * Empty after a restart, and safe to be: a switched-off device is refused a
   * controller by `IntegrationManager.instantiateDeviceController`, so nothing
   * exists to report it offline in the first place. That gate is what keeps
   * this set an optimisation rather than a load-bearing record.
   */
  private suppressed = new Set<number>();
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
    this.clearPendingOfflineEvent(deviceId);
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
      this.clearPendingOfflineEvent(deviceId);
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
      this.scheduleOfflineConnectivityEvent(deviceId, previousStatus, Date.now());
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
    this.clearPendingOfflineEvent(deviceId);
    void this.persistImmediate(deviceId, entry);

    if (previousStatus !== 'error') {
      this.emitConnectivityTransition(deviceId, 'error', previousStatus, at);
    }
  }

  /**
   * Stop tracking a device we are deliberately no longer talking to, so its
   * teardown does not post "went offline" to the user's timeline a minute
   * after they flipped their own switch. The persisted `status` / `last_seen`
   * stay put as the last honest observation.
   */
  forget(deviceId: number): void {
    this.clearPendingOfflineEvent(deviceId);
    this.entries.delete(deviceId);
    this.suppressed.add(deviceId);
  }

  /**
   * Start listening again. Must run before the controller is rebuilt, or the
   * `online` that follows reconnection is swallowed with the noise.
   */
  resume(deviceId: number): void {
    this.suppressed.delete(deviceId);
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

  private clearPendingOfflineEvent(deviceId: number): void {
    const timer = this.pendingOfflineTimers.get(deviceId);
    if (timer === undefined) {
      return;
    }

    clearTimeout(timer);
    this.pendingOfflineTimers.delete(deviceId);
  }

  private scheduleOfflineConnectivityEvent(
    deviceId: number,
    previousStatus: DeviceStatus,
    at: number,
  ): void {
    if (!this.hydrateComplete || this.suppressed.has(deviceId)) {
      return;
    }

    this.clearPendingOfflineEvent(deviceId);

    const previous_state = toConnectivityPreviousState(previousStatus);

    this.pendingOfflineTimers.set(
      deviceId,
      setTimeout(() => {
        this.pendingOfflineTimers.delete(deviceId);
        // Re-checked at fire time: a minute is long enough for the device to
        // have been switched off since.
        if (this.suppressed.has(deviceId)) return;
        void this.emitConnectivityEvent(
          deviceId,
          { type: 'device_connectivity', state: 'offline', previous_state },
          at,
        );
      }, OFFLINE_EVENT_DELAY_MS),
    );
  }

  private emitConnectivityTransition(
    deviceId: number,
    state: DeviceConnectivityEventData['state'],
    previousStatus: DeviceStatus,
    at: number,
  ): void {
    if (!this.hydrateComplete || this.suppressed.has(deviceId)) {
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
