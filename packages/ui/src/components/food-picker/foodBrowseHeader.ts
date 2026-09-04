import type { TFunction } from 'i18next';
import {
  findBrand,
  findGroup,
  NO_BRAND,
  type BrowseStep,
  type FoodBrowseTree,
} from './foodLadder';

export interface FoodBrowseHeading {
  heading: string;
  sub: string | null;
}

/**
 * What the header calls each rung of the ladder, wherever the ladder is
 * hosted — its own sheet, or a page of the sheet a form lives in. One owner,
 * so two hosts cannot name the same rung two different things.
 */
export function foodBrowseHeading(
  step: BrowseStep,
  tree: FoodBrowseTree,
  /** Names the root rung — the bowl or the field this ladder fills. */
  rootTitle: string,
  t: TFunction,
): FoodBrowseHeading {
  if (step.kind === 'brands') {
    const node = findGroup(tree, step.group);
    return {
      heading: t(`food_picker.group_${step.group}`),
      sub: t('food_picker.food_count', { count: node?.foodCount ?? 0 }),
    };
  }
  if (step.kind === 'foods') {
    const node = findBrand(tree, step.group, step.brand);
    return {
      heading: step.brand === NO_BRAND ? t('food_picker.no_brand') : step.brand,
      sub: t('food_picker.food_count', { count: node?.foods.length ?? 0 }),
    };
  }
  return { heading: rootTitle, sub: null };
}
