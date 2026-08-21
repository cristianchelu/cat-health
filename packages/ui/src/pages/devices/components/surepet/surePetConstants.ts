import type { CoarseFoodGroup } from '@/components/food-picker/foodGroups';

/**
 * The SurePet enums this app reads, named once.
 *
 * The API side owns the full set; these are the handful the UI branches on,
 * lifted out of the three places that were spelling them as bare numbers.
 */
export const SUREPET_BOWL_TYPE_LARGE = 1;
export const SUREPET_BOWL_TYPE_TWO_SMALL = 4;

export const SUREPET_FOOD_TYPE_WET = 1;
export const SUREPET_FOOD_TYPE_DRY = 2;

/**
 * What a bowl says it holds, in this app's vocabulary. Undefined when the
 * feeder has not been told — which is a real state, not a default to dry.
 */
export function surePetFoodTypeHint(
  foodType: number | undefined,
): CoarseFoodGroup | undefined {
  if (foodType === SUREPET_FOOD_TYPE_WET) return 'wet';
  if (foodType === SUREPET_FOOD_TYPE_DRY) return 'dry';
  return undefined;
}
