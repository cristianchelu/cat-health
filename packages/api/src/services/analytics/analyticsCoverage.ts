import { addDays, addHours } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { DeviceType } from 'shared';
import type { Database } from '../../database/index.ts';
import type {
  DeviceConnectivityEventData,
  PetPresenceEventData,
} from '../../database/types/EventTable.ts';

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
    if (
      minDurationMs == null ||
      durationMs >= minDurationMs
    ) {
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
    const start =
      interval.start < range.start ? range.start : interval.start;
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
      cursor =
        resolution === 'day' ? addDays(cursor, 1) : addHours(cursor, 1);
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

export async function resolveMonitorDevices(
  db: Kysely<Database>,
  deviceClass: MonitorDeviceClass,
): Promise<number[]> {
  const rows = await db
    .selectFrom('device')
    .select('id')
    .where('type', '=', deviceClass)
    .where('enabled', '=', 1)
    .execute();

  return rows.map((row) => row.id);
}

async function fetchLatestTransitionStateBeforeRange(
  db: Kysely<Database>,
  options: {
    eventType: 'pet_presence' | 'device_connectivity';
    rangeStart: Date;
    petId?: number;
    deviceIds?: number[];
  },
): Promise<Map<number, string>> {
  const { eventType, rangeStart, petId, deviceIds } = options;

  if (petId != null) {
    const row = await db
      .selectFrom('event')
      .select(['data'])
      .where('pet_id', '=', petId)
      .where(sql`json_extract(data, '$.type')`, '=', eventType)
      .where('timestamp', '<', rangeStart)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .executeTakeFirst();

    const state = extractTransitionState(row?.data, eventType);
    return state == null ? new Map() : new Map([[petId, state]]);
  }

  if (deviceIds == null || deviceIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom('event')
    .select(['device_id', 'data', 'timestamp'])
    .where('device_id', 'in', deviceIds)
    .where(sql`json_extract(data, '$.type')`, '=', eventType)
    .where('timestamp', '<', rangeStart)
    .orderBy('timestamp', 'desc')
    .execute();

  const latestByDevice = new Map<number, string>();
  for (const row of rows) {
    if (row.device_id == null || latestByDevice.has(row.device_id)) {
      continue;
    }

    const state = extractTransitionState(row.data, eventType);
    if (state != null) {
      latestByDevice.set(row.device_id, state);
    }
  }

  return latestByDevice;
}

function extractTransitionState(
  data: unknown,
  eventType: 'pet_presence' | 'device_connectivity',
): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as { type?: string; state?: string };
  if (record.type !== eventType || typeof record.state !== 'string') {
    return null;
  }

  return record.state;
}

function seedOpenIntervalFromPriorState(
  priorState: string | undefined,
  startStates: ReadonlySet<string>,
  rangeStart: Date,
): TransitionEvent[] {
  if (priorState == null || !startStates.has(priorState)) {
    return [];
  }

  return [{ timestamp: rangeStart, state: priorState }];
}

export async function buildPetAwayIntervals(
  db: Kysely<Database>,
  petId: number,
  range: TimeRange,
): Promise<TimeInterval[]> {
  const startStates = new Set(['away', 'outside']);
  const endStates = new Set(['home']);

  const [events, priorStates] = await Promise.all([
    db
      .selectFrom('event')
      .select(['timestamp', 'data'])
      .where('pet_id', '=', petId)
      .where(sql`json_extract(data, '$.type')`, '=', 'pet_presence')
      .where('timestamp', '>=', range.start)
      .where('timestamp', '<=', range.end)
      .orderBy('timestamp', 'asc')
      .execute(),
    fetchLatestTransitionStateBeforeRange(db, {
      eventType: 'pet_presence',
      rangeStart: range.start,
      petId,
    }),
  ]);

  const transitions: TransitionEvent[] = [
    ...seedOpenIntervalFromPriorState(
      priorStates.get(petId),
      startStates,
      range.start,
    ),
    ...events
      .map((row) => {
        const data = row.data as PetPresenceEventData;
        return {
          timestamp: row.timestamp,
          state: data.state,
        };
      })
      .filter((row) => row.state != null),
  ];

  return pairTransitionEvents(transitions, {
    startStates,
    endStates,
    range,
  });
}

export async function buildDeviceOutageIntervals(
  db: Kysely<Database>,
  deviceIds: number[],
  range: TimeRange,
  thresholdMinutes: number,
): Promise<TimeInterval[]> {
  if (deviceIds.length === 0) {
    return [];
  }

  const startStates = new Set(['offline', 'error']);
  const endStates = new Set(['online']);
  const minDurationMs = thresholdMinutes * 60_000;

  const [events, priorStates] = await Promise.all([
    db
      .selectFrom('event')
      .select(['timestamp', 'data', 'device_id'])
      .where('device_id', 'in', deviceIds)
      .where(sql`json_extract(data, '$.type')`, '=', 'device_connectivity')
      .where('timestamp', '>=', range.start)
      .where('timestamp', '<=', range.end)
      .orderBy('timestamp', 'asc')
      .execute(),
    fetchLatestTransitionStateBeforeRange(db, {
      eventType: 'device_connectivity',
      rangeStart: range.start,
      deviceIds,
    }),
  ]);

  if (events.length === 0 && priorStates.size === 0) {
    return [];
  }

  const eventsByDevice = new Map<number, TransitionEvent[]>();
  for (const deviceId of deviceIds) {
    eventsByDevice.set(deviceId, [
      ...seedOpenIntervalFromPriorState(
        priorStates.get(deviceId),
        startStates,
        range.start,
      ),
    ]);
  }

  for (const row of events) {
    if (row.device_id == null) {
      continue;
    }

    const data = row.data as DeviceConnectivityEventData;
    const bucket = eventsByDevice.get(row.device_id);
    if (bucket == null) {
      continue;
    }

    bucket.push({
      timestamp: row.timestamp,
      state: data.state,
    });
  }

  const perDeviceIntervals = [...eventsByDevice.entries()].map(
    ([, deviceEvents]) =>
      pairTransitionEvents(deviceEvents, {
        startStates,
        endStates,
        range,
        minDurationMs,
      }),
  );

  return mergeUntrackedIntervals(...perDeviceIntervals);
}
