import { subDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import type { FoodIntakeEventData } from '../../database/types/EventTable.ts';
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
  const { petId, days, timezone, deviceClass, eventType, getAmount, getBounds } =
    options;
  const { rangeStart, rangeEnd, dayKeys } = createDayRange(days, timezone);

  const [metricEvents, weightEvents, lastWeightEvent, untrackedBuckets] =
    await Promise.all([
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
    ]);

  let currentWeight = lastWeightEvent
    ? (lastWeightEvent.data as { weight: number }).weight
    : 0;

  if (currentWeight === 0 && weightEvents.length > 0) {
    currentWeight = (weightEvents[0].data as { weight: number }).weight;
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
          dayWeights.push((we.data as { weight: number }).weight);
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
    getAmount: (data) => (data as { amount?: number }).amount ?? 0,
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
      const nutrients = (data as FoodIntakeEventData).nutrients;
      return Math.round(nutrients?.calories ?? 0);
    },
    getBounds: calorieBoundsFromWeight,
  });
}
