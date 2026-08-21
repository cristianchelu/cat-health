import type { FoodIntakeFoodTypeDTO, FoodTypeDTO, GetFoodDTO } from 'shared';

/**
 * The coarse wet/dry/treat grouping every food-choosing surface shares: the
 * ladder's Browse level, the feeder picker's type pre-filter, and the
 * food_type stamped on logged intake events. One owner so the buckets can't
 * drift between surfaces — `drink` counts as wet everywhere, matching the
 * server's `foodCatalogTypeToIntakeType`.
 */
export type CoarseFoodGroup = 'wet' | 'dry' | 'treat';

export const COARSE_FOOD_GROUPS: readonly CoarseFoodGroup[] = [
  'wet',
  'dry',
  'treat',
];

const GROUP_BY_FOOD_TYPE: Record<FoodTypeDTO, CoarseFoodGroup> = {
  drink: 'wet',
  complete_wet: 'wet',
  complementary_wet: 'wet',
  complete_dry: 'dry',
  complementary_dry: 'dry',
  treat: 'treat',
};

export function coarseFoodGroup(foodType: FoodTypeDTO): CoarseFoodGroup {
  return GROUP_BY_FOOD_TYPE[foodType];
}

export function foodTypesForGroup(group: CoarseFoodGroup): FoodTypeDTO[] {
  return (Object.keys(GROUP_BY_FOOD_TYPE) as FoodTypeDTO[]).filter(
    (type) => GROUP_BY_FOOD_TYPE[type] === group,
  );
}

/** The `food_type` a logged intake event carries for this food. */
export function intakeFoodType(food: GetFoodDTO | null): FoodIntakeFoodTypeDTO {
  return food ? coarseFoodGroup(food.food_type) : 'unknown';
}

/**
 * Calorie density per kilogram — how pet food labels state it, and how you
 * would compare two bags. Per gram would be a fraction under one for wet
 * food, which is neither how it is printed nor easy to read at a glance.
 */
export function kcalPerKilogram(food: GetFoodDTO): number | null {
  if (food.calories_per_100g == null) return null;
  return Math.round(food.calories_per_100g * 10);
}

/** kcal for a portion, or null when the food has no calorie density. */
export function kcalForAmount(food: GetFoodDTO, grams: number): number | null {
  if (food.calories_per_100g == null) return null;
  return (grams * food.calories_per_100g) / 100;
}
