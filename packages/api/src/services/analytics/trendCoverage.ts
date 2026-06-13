import { addDays, addHours } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import { getTrackingGapThresholdMinutes } from '../settings/appSettings.ts';
import {
  buildDeviceOutageIntervals,
  buildPetAwayIntervals,
  mergeUntrackedIntervals,
  resolveMonitorDevices,
  snapIntervalsToBuckets,
  type BucketResolution,
  type MonitorDeviceClass,
  type TimeRange,
} from './analyticsCoverage.ts';

export interface UntrackedInterval {
  start: string;
  end: string;
}

export async function computeUntrackedBuckets(
  db: Kysely<Database>,
  options: {
    petId: number;
    deviceClass: MonitorDeviceClass;
    range: TimeRange;
    resolution: BucketResolution;
    timezone: string;
  },
): Promise<Set<string>> {
  const { petId, deviceClass, range, resolution, timezone } = options;

  const [thresholdMinutes, deviceIds, petAway] = await Promise.all([
    getTrackingGapThresholdMinutes(db),
    resolveMonitorDevices(db, deviceClass),
    buildPetAwayIntervals(db, petId, range),
  ]);

  const deviceOutage = await buildDeviceOutageIntervals(
    db,
    deviceIds,
    range,
    thresholdMinutes,
  );

  const merged = mergeUntrackedIntervals(petAway, deviceOutage);
  return snapIntervalsToBuckets(merged, resolution, timezone);
}

export function bucketsToUntrackedIntervals(
  buckets: ReadonlySet<string>,
  resolution: BucketResolution,
  timezone: string,
): UntrackedInterval[] {
  if (buckets.size === 0) {
    return [];
  }

  const sorted = [...buckets].sort();
  const intervals: UntrackedInterval[] = [];
  let currentStart: Date | null = null;
  let currentEnd: Date | null = null;

  const bucketStart = (key: string): Date =>
    resolution === 'day'
      ? fromZonedTime(`${key}T00:00:00`, timezone)
      : fromZonedTime(key, timezone);

  const bucketEnd = (start: Date): Date =>
    resolution === 'day' ? addDays(start, 1) : addHours(start, 1);

  for (const key of sorted) {
    const start = bucketStart(key);
    const end = bucketEnd(start);

    if (currentStart == null) {
      currentStart = start;
      currentEnd = end;
      continue;
    }

    if (start.getTime() === currentEnd!.getTime()) {
      currentEnd = end;
    } else {
      intervals.push({
        start: currentStart.toISOString(),
        end: currentEnd!.toISOString(),
      });
      currentStart = start;
      currentEnd = end;
    }
  }

  if (currentStart != null && currentEnd != null) {
    intervals.push({
      start: currentStart.toISOString(),
      end: currentEnd.toISOString(),
    });
  }

  return intervals;
}
