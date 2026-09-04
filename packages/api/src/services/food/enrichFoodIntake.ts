import type { FoodTypeDTO } from 'shared';
import { parseFeederFoodCompartments, parseFoodNutrients } from 'shared';
import type { Food } from '../../database/types/FoodTable.ts';
import type {
  FoodIntakeEventData,
  FoodIntakeFoodType,
} from '../../domain/events.ts';
import type { Insertable, Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import type { EventTable } from '../../database/types/EventTable.ts';
import type { EventAttributionColumns } from '../../domain/eventAttribution.ts';
import { parseStoredEventData } from '../../database/types/storedEventData.ts';

type FoodNutrientItem = { nutrient: string; unit: string; value: number };

function readFoodNutrients(food: Food): FoodNutrientItem[] | null {
  if (typeof food.nutrients === 'string') {
    return parseFoodNutrients(JSON.parse(food.nutrients));
  }
  return parseFoodNutrients(food.nutrients);
}

export function calculateNutrientsFromFood(
  amount: number,
  food: Food,
): Record<string, number> {
  const nutrients: Record<string, number> = {};
  const nutrientsArray = readFoodNutrients(food);

  if (food.moisture_percent != null) {
    nutrients.moisture_ml = amount * (food.moisture_percent / 100);
  }
  if (food.calories_per_100g != null) {
    nutrients.calories = amount * (food.calories_per_100g / 100);
  }
  if (nutrientsArray && Array.isArray(nutrientsArray)) {
    for (const item of nutrientsArray) {
      const { nutrient, unit, value } = item;
      if (value == null || typeof value !== 'number') continue;
      if (unit === 'percent') {
        nutrients[`${nutrient}_g`] = amount * (value / 100);
      } else if (unit === 'g') {
        nutrients[`${nutrient}_g`] = amount * (value / 100);
      } else if (unit === 'mg') {
        nutrients[`${nutrient}_mg`] = amount * (value / 100);
      }
    }
  }
  return nutrients;
}

export function foodCatalogTypeToIntakeType(
  foodType: FoodTypeDTO,
): FoodIntakeFoodType {
  if (foodType === 'treat') return 'treat';
  if (foodType === 'complete_dry' || foodType === 'complementary_dry') {
    return 'dry';
  }
  if (
    foodType === 'drink' ||
    foodType === 'complete_wet' ||
    foodType === 'complementary_wet'
  ) {
    return 'wet';
  }
  return 'unknown';
}

export function resolveFoodIdForCompartment(
  config: unknown,
  compartmentId: string,
): number | undefined {
  return parseFeederFoodCompartments(config).get(compartmentId);
}

export function enrichFoodIntakeEventData(
  base: FoodIntakeEventData,
  food: Food,
): FoodIntakeEventData {
  const nutrients = calculateNutrientsFromFood(base.amount, food);
  return {
    ...base,
    food_id: food.id,
    food_type: foodCatalogTypeToIntakeType(food.food_type),
    nutrients: {
      ...base.nutrients,
      ...nutrients,
    },
  };
}

/**
 * Make every number derived from a food_intake row agree with the row.
 *
 * Both write paths (POST and PATCH) call this after the row lands — and only
 * when the write actually touched the amount, the food link, or the
 * attribution. A note or a verify is not a nutritional statement, so it must
 * never move numbers: without that gate, editing a food's catalog entry would
 * silently rewrite every historical meal the next time one was annotated.
 *
 * Nutrients (only when `recomputeNutrients`, i.e. the `data` itself changed):
 * - `food_id` resolves to a food row with nutrition data → recomputed from
 *   the row outright. Stored nutrients are replaced, not merged: after a food
 *   swap a merge would keep keys of the old food the new one cannot speak for.
 * - No usable food nutrition, stored nutrients, and a changed amount with a
 *   non-zero `previousAmount` → scaled linearly. This is exact, not an
 *   approximation: every term in `calculateNutrientsFromFood` is
 *   `amount × constant`, so the ratio *is* the recomputation. It keeps a
 *   meal's nutrition when its food row was later deleted or pared down to a
 *   name. A scale to 0 g drops the nutrients instead of storing zeros — a
 *   zero meal has no nutrition, and zero-valued keys would masquerade as a
 *   measurement (they are also unrecoverable: nothing can scale back up from
 *   0, so the honest state is "unknown", cured by re-linking a food).
 * - Otherwise → whatever the row already says, untouched.
 *
 * The moisture child (the `water_intake` row with `source: 'food'`) follows
 * the reconciled `moisture_ml`: updated in place — attribution included, so
 * a meal reattributed to `human` stops counting as the cat's water — inserted
 * when newly owed, deleted when the moisture is gone. An attribution-only
 * write syncs the child's attribution and touches nothing else. Writes the
 * child already agrees with are skipped.
 *
 * Callers run this inside the same transaction as the parent write: the
 * parent row, its nutrients and the child move together or not at all.
 */
export async function reconcileFoodIntakeDerived(options: {
  db: Kysely<Database>;
  eventId: number;
  data: FoodIntakeEventData;
  attribution: EventAttributionColumns;
  timestamp: Date;
  /**
   * Whether the write changed the event's `data` (amount / food link). False
   * for attribution-only writes, which sync the child's ownership but must
   * not re-derive nutrients from today's catalog.
   */
  recomputeNutrients: boolean;
  /** The meal's grams before this write; enables the linear-scale fallback. */
  previousAmount?: number;
}): Promise<FoodIntakeEventData> {
  const {
    db,
    eventId,
    data,
    attribution,
    timestamp,
    recomputeNutrients,
    previousAmount,
  } = options;

  let next = data;
  if (recomputeNutrients) {
    const food =
      typeof data.food_id === 'number'
        ? await db
            .selectFrom('food')
            .selectAll()
            .where('id', '=', data.food_id)
            .executeTakeFirst()
        : undefined;
    // The catalog's coarse type holds even for a name-only food row.
    const linked = food
      ? {
          ...data,
          food_id: food.id,
          food_type: foodCatalogTypeToIntakeType(food.food_type),
        }
      : data;
    const computed = food
      ? calculateNutrientsFromFood(data.amount, food)
      : undefined;

    if (computed && Object.keys(computed).length > 0) {
      next = { ...linked, nutrients: computed };
    } else if (linked.nutrients != null && data.amount === 0) {
      const dropped = { ...linked };
      delete dropped.nutrients;
      next = dropped;
    } else if (
      linked.nutrients != null &&
      previousAmount != null &&
      previousAmount > 0 &&
      data.amount !== previousAmount
    ) {
      const ratio = data.amount / previousAmount;
      next = {
        ...linked,
        nutrients: Object.fromEntries(
          Object.entries(linked.nutrients).map(([key, value]) => [
            key,
            value * ratio,
          ]),
        ),
      };
    } else {
      next = linked;
    }
  }

  const moistureMl = next.nutrients?.moisture_ml ?? 0;
  const children = await db
    .selectFrom('event')
    .select(['id', 'data', 'pet_id', 'caused_by', 'attributed_by'])
    .where('parent_event_id', '=', eventId)
    .execute();
  const moistureChild = children.find((child) => {
    const childData = parseStoredEventData(child.data);
    return childData?.type === 'water_intake' && childData.source === 'food';
  });

  const childAttributionStale =
    moistureChild != null &&
    (moistureChild.pet_id !== attribution.pet_id ||
      moistureChild.caused_by !== attribution.caused_by ||
      moistureChild.attributed_by !== attribution.attributed_by);

  if (!recomputeNutrients) {
    // Attribution is the only thing this write can have moved.
    if (childAttributionStale) {
      await db
        .updateTable('event')
        .set({ ...attribution })
        .where('id', '=', moistureChild.id)
        .execute();
    }
    return next;
  }

  if (moistureMl > 0) {
    if (moistureChild) {
      const childData = parseStoredEventData(moistureChild.data);
      if (
        childData?.type === 'water_intake' &&
        (childData.amount !== moistureMl || childAttributionStale)
      ) {
        await db
          .updateTable('event')
          .set({
            ...attribution,
            data: { ...childData, amount: moistureMl },
          })
          .where('id', '=', moistureChild.id)
          .execute();
      }
    } else {
      await db
        .insertInto('event')
        .values(
          buildMoistureChildEventValues({
            parentEventId: eventId,
            attribution,
            timestamp,
            moistureMl,
          }),
        )
        .execute();
    }
  } else if (moistureChild) {
    await db.deleteFrom('event').where('id', '=', moistureChild.id).execute();
  }

  return next;
}

export function buildMoistureChildEventValues(options: {
  parentEventId: number;
  /** Mirrors the parent meal: moisture from food nobody ate isn't a cat's water. */
  attribution: EventAttributionColumns;
  timestamp: Date;
  moistureMl: number;
}): Insertable<EventTable> {
  return {
    parent_event_id: options.parentEventId,
    ...options.attribution,
    device_id: null,
    timestamp: options.timestamp,
    data: {
      type: 'water_intake',
      amount: options.moistureMl,
      source: 'food',
    },
    raw_data: null,
    human_verified: true,
  };
}
