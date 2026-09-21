import { addDays, addHours } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { DeviceType } from 'shared';
import type { Database } from '../../database/index.ts';
import type { EventData } from '../../domain/events.ts';

export type MonitorDeviceClass = Extract<
  DeviceType,
  'feeder' | 'water_fountain' | 'litterbox'
>;

export type BucketResolution = 'day' | 'hour';

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface TimeInterval {
  start: Date;
  end: Date;
}

export interface TransitionEvent {
  timestamp: Date;
  state: string;
}

export interface PairTransitionOptions {
  startStates: ReadonlySet<string>;
  endStates: ReadonlySet<string>;
  range: TimeRange;
  minDurationMs?: number;
}

function toStateSet(
  states: ReadonlySet<string> | readonly string[],
): ReadonlySet<string> {
  return states instanceof Set ? states : new Set(states);
}

export function pairTransitionEvents(
  events: TransitionEvent[],
  options: PairTransitionOptions,
): TimeInterval[] {
  const startStates = toStateSet(options.startStates);
  const endStates = toStateSet(options.endStates);
  const { range, minDurationMs } = options;

  const sorted = [...events].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  const intervals: TimeInterval[] = [];
  let openStart: Date | null = null;

  const closeInterval = (end: Date) => {
    if (openStart == null) {
      return;
    }

    const durationMs = end.getTime() - openStart.getTime();
    if (minDurationMs == null || durationMs >= minDurationMs) {
      intervals.push({ start: openStart, end });
    }

    openStart = null;
  };

  for (const event of sorted) {
    if (startStates.has(event.state)) {
      if (openStart == null) {
        openStart = event.timestamp;
      }
      continue;
    }

    if (endStates.has(event.state)) {
      closeInterval(event.timestamp);
    }
  }

  if (openStart != null) {
    closeInterval(options.range.end);
  }

  return clipIntervalsToRange(intervals, range);
}

function clipIntervalsToRange(
  intervals: TimeInterval[],
  range: TimeRange,
): TimeInterval[] {
  const clipped: TimeInterval[] = [];

  for (const interval of intervals) {
    const start = interval.start < range.start ? range.start : interval.start;
    const end = interval.end > range.end ? range.end : interval.end;

    if (start < end) {
      clipped.push({ start, end });
    }
  }

  return clipped;
}

export function mergeUntrackedIntervals(
  ...intervalGroups: TimeInterval[][]
): TimeInterval[] {
  const all = intervalGroups
    .flat()
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (all.length === 0) {
    return [];
  }

  const merged: TimeInterval[] = [];
  let current: TimeInterval = { ...all[0] };

  for (let i = 1; i < all.length; i++) {
    const next = all[i];
    if (next.start.getTime() <= current.end.getTime()) {
      if (next.end > current.end) {
        current = { start: current.start, end: next.end };
      }
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

export function floorToBucket(
  date: Date,
  resolution: BucketResolution,
  timezone: string,
): Date {
  if (resolution === 'day') {
    const dateStr = formatInTimeZone(date, timezone, 'yyyy-MM-dd');
    return fromZonedTime(`${dateStr}T00:00:00`, timezone);
  }

  const hourStr = formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:00:00");
  return fromZonedTime(hourStr, timezone);
}

export function ceilToBucket(
  date: Date,
  resolution: BucketResolution,
  timezone: string,
): Date {
  const floored = floorToBucket(date, resolution, timezone);
  if (date.getTime() === floored.getTime()) {
    return floored;
  }

  return resolution === 'day' ? addDays(floored, 1) : addHours(floored, 1);
}

export function formatBucketKey(
  bucketStart: Date,
  resolution: BucketResolution,
  timezone: string,
): string {
  if (resolution === 'day') {
    return formatInTimeZone(bucketStart, timezone, 'yyyy-MM-dd');
  }

  return formatInTimeZone(bucketStart, timezone, "yyyy-MM-dd'T'HH:00:00");
}

export function snapIntervalsToBuckets(
  intervals: TimeInterval[],
  resolution: BucketResolution,
  timezone: string,
): Set<string> {
  const buckets = new Set<string>();

  for (const interval of intervals) {
    let cursor = floorToBucket(interval.start, resolution, timezone);
    const endBucket = ceilToBucket(interval.end, resolution, timezone);

    while (cursor < endBucket) {
      buckets.add(formatBucketKey(cursor, resolution, timezone));
      cursor = resolution === 'day' ? addDays(cursor, 1) : addHours(cursor, 1);
    }
  }

  return buckets;
}

export function isBucketTracked(
  bucket: string,
  untrackedBuckets: ReadonlySet<string>,
): boolean {
  return !untrackedBuckets.has(bucket);
}

/**
 * Every device of the class, switched off or not. Whether a device counts
 * towards coverage at a given moment is answered by its timeline — the
 * `device_enablement` events below — not by the row's current switch, so the
 * outages a retired device suffered while it was in service keep hatching.
 */
export async function resolveMonitorDevices(
  db: Kysely<Database>,
  deviceClass: MonitorDeviceClass,
): Promise<number[]> {
  const rows = await db
    .selectFrom('device')
    .select('id')
    .where('type', '=', deviceClass)
    .execute();

  return rows.map((row) => row.id);
}

/**
 * One untracked-interval state machine: which event kinds feed it, the state
 * each event lands in, and which of those states open or close an interval.
 */
interface TransitionSource {
  eventTypes: readonly EventData['type'][];
  stateOf: (data: unknown) => string | null;
  startStates: ReadonlySet<string>;
  endStates: ReadonlySet<string>;
}

const PET_AWAY: TransitionSource = {
  eventTypes: ['pet_presence'],
  stateOf: (data) => {
    const record = data as Partial<EventData> | null | undefined;
    return record?.type === 'pet_presence' ? (record.state ?? null) : null;
  },
  startStates: new Set(['away', 'outside']),
  endStates: new Set(['home']),
};

/**
 * Connectivity is what the device said; enablement is what the user did.
 * "enabled" opens an outage until the device is next heard from, so a device
 * switched back on that never connects reads as untracked, and "disabled"
 * closes whatever was open: from here the device is not part of the house.
 */
const DEVICE_OUTAGE: TransitionSource = {
  eventTypes: ['device_connectivity', 'device_enablement'],
  stateOf: (data) => {
    const record = data as Partial<EventData> | null | undefined;
    switch (record?.type) {
      case 'device_connectivity':
        return record.state ?? null;
      case 'device_enablement':
        return record.enabled ? 'enabled' : 'disabled';
      default:
        return null;
    }
  },
  startStates: new Set(['offline', 'error', 'enabled']),
  endStates: new Set(['online', 'disabled']),
};

/** Whose events: one pet, or a set of devices. */
interface TransitionScope {
  column: 'pet_id' | 'device_id';
  ids: readonly number[];
}

/**
 * The transitions each id went through inside the range, in event order,
 * seeded with the state it was already in at `range.start` when that state
 * is one that opens an interval — a pet already away, a device already dark.
 * Every id in the scope gets a list, empty or not.
 */
async function loadTransitions(
  db: Kysely<Database>,
  source: TransitionSource,
  scope: TransitionScope,
  range: TimeRange,
): Promise<Map<number, TransitionEvent[]>> {
  const byId = new Map<number, TransitionEvent[]>(
    scope.ids.map((id) => [id, []]),
  );
  if (scope.ids.length === 0) {
    return byId;
  }

  const events = db
    .selectFrom('event')
    .select([
      sql<number>`${sql.ref(scope.column)}`.as('key'),
      'data',
      'timestamp',
    ])
    .where(scope.column, 'in', scope.ids)
    .where(sql`json_extract(data, '$.type')`, 'in', source.eventTypes);

  // `id` breaks timestamp ties: an `enabled` and the `online` it triggers can
  // share a millisecond, and only in insertion order do they pair up.
  const [prior, inRange] = await Promise.all([
    events
      .where('timestamp', '<', range.start)
      .orderBy('timestamp', 'desc')
      .orderBy('id', 'desc')
      .execute(),
    events
      .where('timestamp', '>=', range.start)
      .where('timestamp', '<=', range.end)
      .orderBy('timestamp', 'asc')
      .orderBy('id', 'asc')
      .execute(),
  ]);

  const seeded = new Set<number>();
  for (const row of prior) {
    if (seeded.has(row.key)) continue;
    const state = source.stateOf(row.data);
    if (state == null) continue;
    seeded.add(row.key);
    if (source.startStates.has(state)) {
      byId.get(row.key)?.push({ timestamp: range.start, state });
    }
  }

  for (const row of inRange) {
    const state = source.stateOf(row.data);
    if (state != null) {
      byId.get(row.key)?.push({ timestamp: row.timestamp, state });
    }
  }

  return byId;
}

export async function buildPetAwayIntervals(
  db: Kysely<Database>,
  petId: number,
  range: TimeRange,
): Promise<TimeInterval[]> {
  const source = PET_AWAY;
  const transitions = await loadTransitions(
    db,
    source,
    { column: 'pet_id', ids: [petId] },
    range,
  );

  return pairTransitionEvents(transitions.get(petId) ?? [], {
    startStates: source.startStates,
    endStates: source.endStates,
    range,
  });
}

export async function buildDeviceOutageIntervals(
  db: Kysely<Database>,
  deviceIds: number[],
  range: TimeRange,
  thresholdMinutes: number,
): Promise<TimeInterval[]> {
  const source = DEVICE_OUTAGE;
  const transitions = await loadTransitions(
    db,
    source,
    { column: 'device_id', ids: deviceIds },
    range,
  );

  const perDeviceIntervals = [...transitions.values()].map((deviceEvents) =>
    pairTransitionEvents(deviceEvents, {
      startStates: source.startStates,
      endStates: source.endStates,
      range,
      minDurationMs: thresholdMinutes * 60_000,
    }),
  );

  return mergeUntrackedIntervals(...perDeviceIntervals);
}
