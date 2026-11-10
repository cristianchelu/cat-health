import { subDays } from 'date-fns';
import {
  DEFAULT_ENERGY_PLAN,
  DEFAULT_WATER_PLAN,
  type EnergyPlan,
  type FoodBandSetting,
  type WaterBandSetting,
  type WaterPlan,
} from 'shared';

import type {
  IntakeTargetEventData,
  WeightTargetEventData,
} from '../../domain/events.ts';

/** The food band as set: whether it is tracked, where it sits, and the plan it resolves under. */
export interface FoodTarget {
  tracked: boolean;
  plan: EnergyPlan;
  setting: FoodBandSetting;
}

/** The water band as set; see `FoodTarget`. */
export interface WaterTarget {
  tracked: boolean;
  plan: WaterPlan;
  setting: WaterBandSetting;
}

/** Everything in effect for a pet at one moment. */
export interface TargetsInEffect {
  food: FoodTarget;
  water: WaterTarget;
  targetWeightG: number | null;
}

/** What a pet resolves against before her first target event: tracked, on the first notch, under the default plan. */
export const DEFAULT_TARGETS: TargetsInEffect = {
  food: {
    tracked: true,
    plan: DEFAULT_ENERGY_PLAN,
    setting: { preset: 'maintain' },
  },
  water: {
    tracked: true,
    plan: DEFAULT_WATER_PLAN,
    setting: { preset: 'normal' },
  },
  targetWeightG: null,
};

/** A target event and the moment it takes effect. */
export interface TargetEvent {
  at: Date;
  data: IntakeTargetEventData | WeightTargetEventData;
}

/** The targets in effect at `at`: for each one, the latest event at or before it. `events` is oldest first. */
export function targetsAt(
  events: readonly TargetEvent[],
  at: Date,
): TargetsInEffect {
  let targets = DEFAULT_TARGETS;
  for (const event of events) {
    if (event.at > at) break;
    targets = withTarget(targets, event.data);
  }
  return targets;
}

/** `targets` with one event's snapshot laid over the part it sets. */
function withTarget(
  targets: TargetsInEffect,
  data: IntakeTargetEventData | WeightTargetEventData,
): TargetsInEffect {
  if (data.type === 'weight_target') {
    return { ...targets, targetWeightG: data.target_g };
  }
  if (data.kind === 'food') {
    const { tracked, plan, setting } = data;
    return { ...targets, food: { tracked, plan, setting } };
  }
  const { tracked, plan, setting } = data;
  return { ...targets, water: { tracked, plan, setting } };
}

/** One weigh-in. */
export interface WeighIn {
  at: Date;
  grams: number;
}

/** How far back a band looks for her weight, so that one odd weigh-in does not move it. */
export const BAND_WEIGHT_WINDOW_DAYS = 14;

/**
 * The weight her bands are worked out at, as of `at`: the median of the
 * weigh-ins in the window before it, or her last weigh-in when the window is
 * empty. Null when she has never been weighed. `weighIns` is oldest first.
 */
export function bandWeightG(
  weighIns: readonly WeighIn[],
  at: Date,
): number | null {
  const upToNow = weighIns.filter((weighIn) => weighIn.at <= at);
  const last = upToNow.at(-1);
  if (!last) return null;

  const windowStart = subDays(at, BAND_WEIGHT_WINDOW_DAYS);
  const inWindow = upToNow
    .filter((weighIn) => weighIn.at > windowStart)
    .map((weighIn) => weighIn.grams);
  if (inWindow.length === 0) return last.grams;
  return median(inWindow);
}

/** The middle value, or the mean of the two middle values. `values` is not empty. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}
