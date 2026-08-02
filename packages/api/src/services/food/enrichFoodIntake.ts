import type { FoodTypeDTO } from 'shared';
import { parseFeederFoodCompartments, parseFoodNutrients } from 'shared';
import type { Food } from '../../database/types/FoodTable.ts';
import type { FoodIntakeEventData, FoodIntakeFoodType } from '../../domain/events.ts';
import type { Insertable } from 'kysely';
import type { EventTable } from '../../database/types/EventTable.ts';
import type { EventAttributionColumns } from '../../domain/eventAttribution.ts';

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
