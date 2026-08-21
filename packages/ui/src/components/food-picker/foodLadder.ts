import type { GetFoodDTO } from 'shared';
import {
  COARSE_FOOD_GROUPS,
  coarseFoodGroup,
  type CoarseFoodGroup,
} from './foodGroups';

export type { CoarseFoodGroup };

/**
 * Above this many foods, the picker organizes: Recent, then a
 * type → brand → food drilldown. At or below it, organizing would be
 * ceremony — the whole library fits on one screen, so it is one flat list.
 */
export const FLAT_LIST_MAX_FOODS = 8;

/** The bucket a food with no brand recorded falls into. */
export const NO_BRAND = '';

export interface BrandNode {
  /** The brand as recorded, or `NO_BRAND` for foods with none. */
  brand: string;
  foods: GetFoodDTO[];
}

export interface GroupNode {
  group: CoarseFoodGroup;
  brands: BrandNode[];
  foodCount: number;
}

export type FoodBrowseTree = GroupNode[];

/** A rung of the browse ladder, shared by every surface that picks a food. */
export type BrowseStep =
  | { kind: 'root' }
  | { kind: 'brands'; group: CoarseFoodGroup }
  | { kind: 'foods'; group: CoarseFoodGroup; brand: string };

export function isFlatMode(foods: readonly GetFoodDTO[]): boolean {
  return foods.length <= FLAT_LIST_MAX_FOODS;
}

/**
 * Foods grouped type → brand → food, in the order the ladder walks them.
 * Empty groups are dropped: a household with no treats never sees a Treats
 * row promising two taps to nothing.
 */
export function buildFoodBrowseTree(
  foods: readonly GetFoodDTO[],
): FoodBrowseTree {
  const byGroup = new Map<CoarseFoodGroup, Map<string, GetFoodDTO[]>>();

  for (const food of foods) {
    const group = coarseFoodGroup(food.food_type);
    const brand = food.brand?.trim() || NO_BRAND;
    const brands = byGroup.get(group) ?? new Map<string, GetFoodDTO[]>();
    byGroup.set(group, brands);
    brands.set(brand, [...(brands.get(brand) ?? []), food]);
  }

  return COARSE_FOOD_GROUPS.flatMap((group) => {
    const brands = byGroup.get(group);
    if (!brands) return [];
    const nodes: BrandNode[] = [...brands.entries()]
      .map(([brand, groupFoods]) => ({
        brand,
        foods: [...groupFoods].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      // Unbranded foods sort last; the rest alphabetically.
      .sort((a, b) => {
        if (a.brand === NO_BRAND) return 1;
        if (b.brand === NO_BRAND) return -1;
        return a.brand.localeCompare(b.brand);
      });
    return [
      {
        group,
        brands: nodes,
        foodCount: nodes.reduce((sum, node) => sum + node.foods.length, 0),
      },
    ];
  });
}

export function findGroup(
  tree: FoodBrowseTree,
  group: CoarseFoodGroup,
): GroupNode | undefined {
  return tree.find((node) => node.group === group);
}

export function findBrand(
  tree: FoodBrowseTree,
  group: CoarseFoodGroup,
  brand: string,
): BrandNode | undefined {
  return findGroup(tree, group)?.brands.find((node) => node.brand === brand);
}

/**
 * The step a type choice lands on. A type carrying a single brand skips the
 * brand rung, because picking the only brand decides nothing — but the food
 * rung is never skipped, however few foods are on it.
 *
 * Choosing the food is the decision this whole ladder exists to make, and it
 * is also how you find out the tin in your hand is not in the library at all.
 * Making it for you would take both away, and the sheet would vanish under a
 * choice you never saw.
 */
export function stepForGroup(
  tree: FoodBrowseTree,
  group: CoarseFoodGroup,
): BrowseStep {
  const node = findGroup(tree, group);
  if (!node || node.brands.length !== 1) return { kind: 'brands', group };
  return { kind: 'foods', group, brand: node.brands[0].brand };
}
