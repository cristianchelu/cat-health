import { addDays, startOfDay } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
  LITTERBOX_SAMPLE_HZ,
  type LitterboxAnalysisStatePeriod,
  type LitterboxUseEliminationType,
} from 'shared';

import type { LitterboxUseEventData } from '../../database/types/EventTable.ts';

export interface LitterboxVisitRow {
  id: number;
  timestamp: Date;
  device_id: number | null;
  human_verified: boolean;
  data: LitterboxUseEventData;
}

export interface LitterboxTrendEvent {
  type: LitterboxUseEliminationType;
  timestamp: string;
  straining?: boolean;
  id?: number;
  duration?: number;
  elimination_weight?: number;
  human_verified?: boolean;
  device_id?: number | null;
  bout_durations?: {
    urination?: number;
    defecation?: number;
  };
}

export interface LitterboxDailySummary {
  urinationCount: number;
  defecationCount: number;
  bothCount: number;
  noEliminationCount: number;
  unknownCount: number;
  strainingCount: number;
  totalEliminationWeight: number;
  avgEliminationWeight: number | null;
  medianEliminationWeight: number | null;
  avgDuration: number | null;
  medianDuration: number | null;
  maxDuration: number | null;
}

export interface LitterboxTrendDay {
  date: string;
  events: LitterboxTrendEvent[];
  summary?: LitterboxDailySummary;
}

export interface LitterboxChartPoint {
  timestamp: string;
  value: number;
  eventId?: number;
  straining?: boolean;
}

export interface LitterboxDailyCountPoint {
  date: string;
  value: number;
}

export interface LitterboxTrendAnalytics {
  dailyUrinationCount: LitterboxDailyCountPoint[];
  dailyDefecationCount: LitterboxDailyCountPoint[];
  urinationDurationPoints: LitterboxChartPoint[];
  defecationDurationPoints: LitterboxChartPoint[];
  urinationWeightPoints: LitterboxChartPoint[];
  defecationWeightPoints: LitterboxChartPoint[];
  combinedEliminationWeightPoints: LitterboxChartPoint[];
}

export interface LitterboxTrendResult {
  days: LitterboxTrendDay[];
  lastPee: string | null;
  lastPoop: string | null;
  analytics?: LitterboxTrendAnalytics;
}

const EMPTY_SUMMARY: LitterboxDailySummary = {
  urinationCount: 0,
  defecationCount: 0,
  bothCount: 0,
  noEliminationCount: 0,
  unknownCount: 0,
  strainingCount: 0,
  totalEliminationWeight: 0,
  avgEliminationWeight: null,
  medianEliminationWeight: null,
  avgDuration: null,
  medianDuration: null,
  maxDuration: null,
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function hasUrination(type: LitterboxUseEliminationType): boolean {
  return type === 'urination' || type === 'both';
}

function hasDefecation(type: LitterboxUseEliminationType): boolean {
  return type === 'defecation' || type === 'both';
}

function getBoutDurations(
  segments?: LitterboxAnalysisStatePeriod[] | null,
): { urination?: number; defecation?: number } | undefined {
  if (!segments || segments.length === 0) return undefined;

  const durations: { urination?: number; defecation?: number } = {};
  for (const segment of segments) {
    if (
      segment.state !== 'eliminating' ||
      (segment.elimination_type !== 'urination' &&
        segment.elimination_type !== 'defecation')
    ) {
      continue;
    }

    const seconds = Math.max(0, (segment.end - segment.start) / LITTERBOX_SAMPLE_HZ);
    durations[segment.elimination_type] =
      (durations[segment.elimination_type] ?? 0) + seconds;
  }

  return durations.urination !== undefined || durations.defecation !== undefined
    ? durations
    : undefined;
}

function createDateKeys(startTime: Date, endTime: Date, timezone: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  let cursor = startOfDay(startTime);
  const end = startOfDay(endTime);

  while (cursor <= end) {
    const key = formatInTimeZone(cursor, timezone, 'yyyy-MM-dd');
    if (!seen.has(key)) {
      keys.push(key);
      seen.add(key);
    }
    cursor = addDays(cursor, 1);
  }

  const endKey = formatInTimeZone(endTime, timezone, 'yyyy-MM-dd');
  if (!seen.has(endKey)) {
    keys.push(endKey);
  }

  return keys;
}

function summarizeEvents(events: LitterboxTrendEvent[]): LitterboxDailySummary {
  const summary = { ...EMPTY_SUMMARY };
  const weights: number[] = [];
  const durations: number[] = [];

  for (const event of events) {
    if (hasUrination(event.type)) summary.urinationCount += 1;
    if (hasDefecation(event.type)) summary.defecationCount += 1;
    if (event.type === 'both') summary.bothCount += 1;
    if (event.type === 'no_elimination') summary.noEliminationCount += 1;
    if (event.type === 'unknown') summary.unknownCount += 1;
    if (event.straining) summary.strainingCount += 1;
    if (event.elimination_weight !== undefined) weights.push(event.elimination_weight);
    if (event.duration !== undefined) durations.push(event.duration);
  }

  summary.totalEliminationWeight = weights.reduce((sum, value) => sum + value, 0);
  summary.avgEliminationWeight = average(weights);
  summary.medianEliminationWeight = median(weights);
  summary.avgDuration = average(durations);
  summary.medianDuration = median(durations);
  summary.maxDuration = durations.length > 0 ? Math.max(...durations) : null;

  return summary;
}

function createAnalytics(days: LitterboxTrendDay[]): LitterboxTrendAnalytics {
  const dailyUrinationCount: LitterboxDailyCountPoint[] = [];
  const dailyDefecationCount: LitterboxDailyCountPoint[] = [];
  const urinationDurationPoints: LitterboxChartPoint[] = [];
  const defecationDurationPoints: LitterboxChartPoint[] = [];
  const urinationWeightPoints: LitterboxChartPoint[] = [];
  const defecationWeightPoints: LitterboxChartPoint[] = [];
  const combinedEliminationWeightPoints: LitterboxChartPoint[] = [];

  for (const day of days) {
    const summary = day.summary ?? summarizeEvents(day.events);
    dailyUrinationCount.push({ date: day.date, value: summary.urinationCount });
    dailyDefecationCount.push({ date: day.date, value: summary.defecationCount });

    for (const event of day.events) {
      const basePoint = {
        timestamp: event.timestamp,
        eventId: event.id,
        straining: event.straining,
      };

      const urinationDuration = event.bout_durations?.urination;
      if (urinationDuration !== undefined) {
        urinationDurationPoints.push({ ...basePoint, value: urinationDuration });
      }

      const defecationDuration = event.bout_durations?.defecation;
      if (defecationDuration !== undefined) {
        defecationDurationPoints.push({ ...basePoint, value: defecationDuration });
      }

      if (event.elimination_weight !== undefined) {
        if (event.type === 'urination') {
          urinationWeightPoints.push({
            ...basePoint,
            value: event.elimination_weight,
          });
        } else if (event.type === 'defecation') {
          defecationWeightPoints.push({
            ...basePoint,
            value: event.elimination_weight,
          });
        } else if (event.type === 'both') {
          combinedEliminationWeightPoints.push({
            ...basePoint,
            value: event.elimination_weight,
          });
        }
      }

    }
  }

  return {
    dailyUrinationCount,
    dailyDefecationCount,
    urinationDurationPoints,
    defecationDurationPoints,
    urinationWeightPoints,
    defecationWeightPoints,
    combinedEliminationWeightPoints,
  };
}

export function buildLitterboxTrendResult(input: {
  visits: LitterboxVisitRow[];
  startTime: Date;
  endTime: Date;
  timezone: string;
  includeDetails: boolean;
}): LitterboxTrendResult {
  const dayMap = new Map<string, LitterboxTrendDay>();

  for (const date of createDateKeys(input.startTime, input.endTime, input.timezone)) {
    dayMap.set(date, { date, events: [] });
  }

  let lastPee: Date | null = null;
  let lastPoop: Date | null = null;

  for (const visit of input.visits) {
    const date = formatInTimeZone(visit.timestamp, input.timezone, 'yyyy-MM-dd');
    const day = dayMap.get(date);
    if (!day) continue;

    const eliminationType = visit.data.elimination_type || 'unknown';
    const event: LitterboxTrendEvent = {
      type: eliminationType,
      timestamp: visit.timestamp.toISOString(),
      ...(visit.data.straining ? { straining: true } : {}),
    };

    if (input.includeDetails) {
      event.id = visit.id;
      event.duration = visit.data.duration;
      event.elimination_weight = visit.data.elimination_weight;
      event.human_verified = visit.human_verified;
      event.device_id = visit.device_id;
      event.bout_durations = getBoutDurations(visit.data.segments);
    }

    day.events.push(event);

    if (hasUrination(eliminationType) && (!lastPee || visit.timestamp > lastPee)) {
      lastPee = visit.timestamp;
    }
    if (hasDefecation(eliminationType) && (!lastPoop || visit.timestamp > lastPoop)) {
      lastPoop = visit.timestamp;
    }
  }

  const days = [...dayMap.values()];
  if (input.includeDetails) {
    for (const day of days) {
      day.summary = summarizeEvents(day.events);
    }
  }

  return {
    days,
    lastPee: lastPee?.toISOString() ?? null,
    lastPoop: lastPoop?.toISOString() ?? null,
    ...(input.includeDetails ? { analytics: createAnalytics(days) } : {}),
  };
}
