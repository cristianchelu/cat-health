import { subDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import { parseStoredEventData } from '../../database/types/storedEventData.ts';
import { isBucketTracked } from './analyticsCoverage.ts';
import { computeUntrackedBuckets } from './trendCoverage.ts';

const DEFAULT_DAILY_TARGET_KCAL = 220;

export interface DailyMetricTrendDay {
  date: string;
  amount: number;
  tracked: boolean;
  lowerBound: number;
  upperBound: number;
  averageWeight: number;
}

export function calorieBoundsFromWeight(avgWeightGrams: number): {
  lowerBound: number;
  upperBound: number;
} {
  if (avgWeightGrams > 0) {
    const weightKg = avgWeightGrams / 1000;
    const target = 70 * weightKg ** 0.75;
    return { lowerBound: target * 0.8, upperBound: target * 1.2 };
  }

  return {
    lowerBound: DEFAULT_DAILY_TARGET_KCAL * 0.8,
    upperBound: DEFAULT_DAILY_TARGET_KCAL * 1.2,
  };
}

function waterBoundsFromWeight(avgWeightGrams: number): {
  lowerBound: number;
  upperBound: number;
} {
  const weightInKg = avgWeightGrams / 1000;
  return {
    lowerBound: weightInKg * 40,
    upperBound: weightInKg * 50,
  };
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
    getBounds: (avgWeightGrams: number) => {
      lowerBound: number;
      upperBound: number;
    };
  },
): Promise<DailyMetricTrendDay[]> {
  const {
    petId,
    days,
    timezone,
    deviceClass,
    eventType,
    getAmount,
    getBounds,
  } = options;
  const { rangeStart, rangeEnd, dayKeys } = createDayRange(days, timezone);

  const [
    metricEvents,
    weightEvents,
    lastWeightEvent,
    untrackedBuckets,
    anyMetricEvent,
  ] = await Promise.all([
    db
      .selectFrom('event')
      .selectAll()
      .where('pet_id', '=', petId)
      .where(sql`json_extract(data, '$.type')`, '=', eventType)
      .where('timestamp', '>=', rangeStart)
      .orderBy('timestamp', 'asc')
      .execute(),
    db
      .selectFrom('event')
      .selectAll()
      .where('pet_id', '=', petId)
      .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
      .where('timestamp', '>=', rangeStart)
      .orderBy('timestamp', 'asc')
      .execute(),
    db
      .selectFrom('event')
      .selectAll()
      .where('pet_id', '=', petId)
      .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
      .where('timestamp', '<', rangeStart)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .executeTakeFirst(),
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
      .where(sql`json_extract(data, '$.type')`, '=', eventType)
      .limit(1)
      .executeTakeFirst(),
  ]);

  // Coverage (`tracked`) is household-device-based. Without any intake events for
  // this pet, a full series of tracked amount:0 reads as measured zeros — return
  // [] so Overview can show the empty state (unknown / never tracked).
  if (anyMetricEvent == null) {
    return [];
  }

  let currentWeight = 0;
  const lastWeightData = lastWeightEvent
    ? parseStoredEventData(lastWeightEvent.data)
    : null;
  if (lastWeightData?.type === 'weight_measurement') {
    currentWeight = lastWeightData.weight;
  }
  if (currentWeight === 0 && weightEvents.length > 0) {
    const firstWeightData = parseStoredEventData(weightEvents[0].data);
    if (firstWeightData?.type === 'weight_measurement') {
      currentWeight = firstWeightData.weight;
    }
  }

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
    while (weightEventIndex < weightEvents.length) {
      const we = weightEvents[weightEventIndex];
      if (we.timestamp <= dayEnd) {
        if (we.timestamp >= dayStart) {
          const weightData = parseStoredEventData(we.data);
          if (weightData?.type === 'weight_measurement') {
            dayWeights.push(weightData.weight);
          }
        }
        weightEventIndex++;
      } else {
        break;
      }
    }

    let avgWeight = currentWeight;
    if (dayWeights.length > 0) {
      avgWeight =
        dayWeights.reduce((sum, weight) => sum + weight, 0) / dayWeights.length;
      currentWeight = avgWeight;
    }

    const bounds = getBounds(avgWeight);
    result.push({
      date: dateStr,
      amount: dailyAmounts.get(dateStr) ?? 0,
      tracked: isBucketTracked(dateStr, untrackedBuckets),
      lowerBound: bounds.lowerBound,
      upperBound: bounds.upperBound,
      averageWeight: avgWeight,
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
    getBounds: waterBoundsFromWeight,
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
    getBounds: calorieBoundsFromWeight,
  });
}
