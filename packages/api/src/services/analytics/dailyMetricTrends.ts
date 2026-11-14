import { subDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { Kysely } from 'kysely';
import { boundsOf, type IntakeKind } from 'shared';
import type { Database } from '../../database/index.ts';
import { parseStoredEventData } from '../../database/types/storedEventData.ts';
import { loadNeedsInputs, trackedBandsAt } from '../nutrition/dietaryNeeds.ts';
import { isBucketTracked } from './analyticsCoverage.ts';
import { computeUntrackedBuckets } from './trendCoverage.ts';

export interface DailyMetricTrendDay {
  date: string;
  amount: number;
  /** Whether a device covered the day. Not whether a band is set. */
  tracked: boolean;
  /** The day's band; null when the band is not tracked, its preset has no answer, or she has never been weighed. */
  lowerBound: number | null;
  upperBound: number | null;
  averageWeight: number;
}

function createDayRange(
  days: number,
  timezone: string,
): { rangeStart: Date; rangeEnd: Date; dayKeys: string[] } {
  const today = new Date();
  const dayKeys: string[] = [];

  for (let i = 0; i < days; i++) {
    const d = subDays(today, days - 1 - i);
    dayKeys.push(formatInTimeZone(d, timezone, 'yyyy-MM-dd'));
  }

  const rangeStart = fromZonedTime(`${dayKeys[0]}T00:00:00`, timezone);
  const rangeEnd = fromZonedTime(
    `${dayKeys[dayKeys.length - 1]}T23:59:59.999`,
    timezone,
  );

  return { rangeStart, rangeEnd, dayKeys };
}

async function buildDailyMetricTrends(
  db: Kysely<Database>,
  options: {
    petId: number;
    days: number;
    timezone: string;
    deviceClass: 'water_fountain' | 'feeder';
    eventType: 'water_intake' | 'food_intake';
    getAmount: (data: unknown) => number;
    /** Which of the pet's bands each day is judged against. */
    kind: IntakeKind;
  },
): Promise<DailyMetricTrendDay[]> {
  const { petId, days, timezone, deviceClass, eventType, getAmount, kind } =
    options;
  const { rangeStart, rangeEnd, dayKeys } = createDayRange(days, timezone);

  const [metricEvents, needsInputs, untrackedBuckets, anyMetricEvent] =
    await Promise.all([
      db
        .selectFrom('event')
        .selectAll()
        .where('pet_id', '=', petId)
        .where('type', '=', eventType)
        .where('timestamp', '>=', rangeStart)
        .orderBy('timestamp', 'asc')
        .execute(),
      loadNeedsInputs(db, petId, rangeStart, rangeEnd),
      computeUntrackedBuckets(db, {
        petId,
        deviceClass,
        range: { start: rangeStart, end: rangeEnd },
        resolution: 'day',
        timezone,
      }),
      db
        .selectFrom('event')
        .select('id')
        .where('pet_id', '=', petId)
        .where('type', '=', eventType)
        .limit(1)
        .executeTakeFirst(),
    ]);

  // Coverage (`tracked`) is household-device-based. Without any intake events for
  // this pet, a full series of tracked amount:0 reads as measured zeros — return
  // [] so Overview can show the empty state (unknown / never tracked).
  if (anyMetricEvent == null || !needsInputs) {
    return [];
  }

  // The day's average weight carries the last known one over days without a
  // weigh-in, starting from the last before the range or the first inside it.
  const { weighIns } = needsInputs;
  const lastBefore = weighIns.filter((w) => w.at < rangeStart).at(-1);
  const weighInsInRange = weighIns.filter((w) => w.at >= rangeStart);
  let currentWeight = lastBefore?.grams ?? weighInsInRange[0]?.grams ?? 0;

  const dailyAmounts = new Map<string, number>();
  for (const date of dayKeys) {
    dailyAmounts.set(date, 0);
  }

  for (const event of metricEvents) {
    const dateStr = formatInTimeZone(event.timestamp, timezone, 'yyyy-MM-dd');
    if (dailyAmounts.has(dateStr)) {
      dailyAmounts.set(
        dateStr,
        (dailyAmounts.get(dateStr) ?? 0) + getAmount(event.data),
      );
    }
  }

  const result: DailyMetricTrendDay[] = [];
  let weightEventIndex = 0;

  for (const dateStr of dayKeys) {
    const dayStart = fromZonedTime(`${dateStr}T00:00:00`, timezone);
    const dayEnd = fromZonedTime(`${dateStr}T23:59:59.999`, timezone);

    const dayWeights: number[] = [];
    while (weightEventIndex < weighInsInRange.length) {
      const weighIn = weighInsInRange[weightEventIndex];
      if (weighIn.at > dayEnd) break;
      if (weighIn.at >= dayStart) dayWeights.push(weighIn.grams);
      weightEventIndex++;
    }
    if (dayWeights.length > 0) {
      currentWeight =
        dayWeights.reduce((sum, weight) => sum + weight, 0) / dayWeights.length;
    }

    // A change made during a day applies to the whole of that day.
    const band = trackedBandsAt(needsInputs, dayEnd, dateStr)[kind];
    const bounds = band ? boundsOf(band) : null;
    result.push({
      date: dateStr,
      amount: dailyAmounts.get(dateStr) ?? 0,
      tracked: isBucketTracked(dateStr, untrackedBuckets),
      lowerBound: bounds?.lower ?? null,
      upperBound: bounds?.upper ?? null,
      averageWeight: currentWeight,
    });
  }

  return result;
}

export function buildWaterTrends(
  db: Kysely<Database>,
  petId: number,
  days: number,
  timezone: string,
): Promise<DailyMetricTrendDay[]> {
  return buildDailyMetricTrends(db, {
    petId,
    days,
    timezone,
    deviceClass: 'water_fountain',
    eventType: 'water_intake',
    getAmount: (data) => {
      const parsed = parseStoredEventData(data);
      return parsed?.type === 'water_intake' ? parsed.amount : 0;
    },
    kind: 'water',
  });
}

export function buildFoodTrends(
  db: Kysely<Database>,
  petId: number,
  days: number,
  timezone: string,
): Promise<DailyMetricTrendDay[]> {
  return buildDailyMetricTrends(db, {
    petId,
    days,
    timezone,
    deviceClass: 'feeder',
    eventType: 'food_intake',
    getAmount: (data) => {
      const parsed = parseStoredEventData(data);
      return parsed?.type === 'food_intake'
        ? Math.round(parsed.nutrients?.calories ?? 0)
        : 0;
    },
    kind: 'food',
  });
}
