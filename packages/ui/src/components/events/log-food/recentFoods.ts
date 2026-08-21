import type { GetEventListItemDTO } from 'shared';

/** A food this pet has actually eaten, newest first. */
export interface RecentFood {
  foodId: number;
  /** ISO timestamp of the most recent log. */
  lastTimestamp: string;
  lastAmount: number;
}

/** How many rows the Recent group shows before Browse takes over. */
export const RECENT_FOOD_COUNT = 3;

function foodIntakeRows(events: readonly GetEventListItemDTO[]) {
  return events.flatMap((event) => {
    const { data } = event;
    if (data.type !== 'food_intake' || data.food_id == null) return [];
    return [{ foodId: data.food_id, amount: data.amount, event }];
  });
}

/**
 * The last few distinct foods, newest first. Events arrive newest-first from
 * the API, so the first sighting of a food id is also its latest — no sorting,
 * and no second pass to find the amount.
 */
export function deriveRecentFoods(
  events: readonly GetEventListItemDTO[],
  count = RECENT_FOOD_COUNT,
): RecentFood[] {
  const seen = new Set<number>();
  const recent: RecentFood[] = [];
  for (const row of foodIntakeRows(events)) {
    if (seen.has(row.foodId)) continue;
    seen.add(row.foodId);
    recent.push({
      foodId: row.foodId,
      lastTimestamp: row.event.timestamp,
      lastAmount: row.amount,
    });
    if (recent.length === count) break;
  }
  return recent;
}

/**
 * The amount to preload the amount step with, per food.
 *
 * Last-used, not most-frequent: it needs no tie-breaking, and when someone
 * switches pouch size mid-bag the newest log is the one that describes what is
 * in the cupboard now.
 */
export function deriveUsualAmounts(
  events: readonly GetEventListItemDTO[],
): Map<number, number> {
  const usual = new Map<number, number>();
  for (const row of foodIntakeRows(events)) {
    if (!usual.has(row.foodId)) usual.set(row.foodId, row.amount);
  }
  return usual;
}
