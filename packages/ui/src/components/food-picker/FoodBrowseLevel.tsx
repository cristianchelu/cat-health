import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetFoodDTO } from 'shared';
import { FoodFlatList } from './FoodFlatList';
import { FoodPickerRow } from './FoodPickerRow';
import {
  NO_BRAND,
  findBrand,
  findGroup,
  isFlatMode,
  stepForGroup,
  type BrowseStep,
  type FoodBrowseTree,
} from './foodLadder';

interface FoodBrowseLevelProps {
  step: BrowseStep;
  tree: FoodBrowseTree;
  foods: readonly GetFoodDTO[];
  /** Walk down a rung. Skipped rungs are resolved before this is called. */
  onPush: (step: BrowseStep) => void;
  onPick: (food: GetFoodDTO) => void;
  /** Rows above the browse list — Recent in the log flow, Not linked in the feeder. */
  leading?: React.ReactNode;
  selectedFoodId?: number | null;
}

/**
 * One rung of the food ladder, wherever the ladder is used. The caller owns
 * the stack and the chrome around it; this owns what a level looks like, so
 * the log flow and the feeder cannot drift apart.
 */
const FoodBrowseLevel: React.FC<FoodBrowseLevelProps> = ({
  step,
  tree,
  foods,
  onPush,
  onPick,
  leading,
  selectedFoodId,
}) => {
  const { t } = useTranslation();

  if (step.kind === 'foods') {
    const node = findBrand(tree, step.group, step.brand);
    return (
      <FoodFlatList
        foods={node?.foods ?? []}
        selectedFoodId={selectedFoodId}
        onSelect={onPick}
      />
    );
  }

  if (step.kind === 'brands') {
    const node = findGroup(tree, step.group);
    return (
      <div className="food-browse-level">
        {leading}
        {node?.brands.map((brand) => (
          <FoodPickerRow
            key={brand.brand || NO_BRAND}
            title={
              brand.brand === NO_BRAND ? t('food_picker.no_brand') : brand.brand
            }
            muted={brand.brand === NO_BRAND}
            trailing={brand.foods.length}
            chevron="forward"
            onClick={() =>
              onPush({ kind: 'foods', group: step.group, brand: brand.brand })
            }
          />
        ))}
      </div>
    );
  }

  /* Root. A library small enough to read at a glance is not worth
     organizing — it goes out flat, types carried by tags. */
  if (isFlatMode(foods)) {
    return (
      <FoodFlatList
        foods={foods}
        selectedFoodId={selectedFoodId}
        onSelect={onPick}
        showTypeTags
        leadingRow={leading}
      />
    );
  }

  return (
    <div className="food-browse-level">
      {leading}
      {tree.map((node) => (
        <FoodPickerRow
          key={node.group}
          title={t(`food_picker.group_${node.group}`)}
          trailing={node.foodCount}
          chevron="forward"
          onClick={() => onPush(stepForGroup(tree, node.group))}
        />
      ))}
    </div>
  );
};

export { FoodBrowseLevel, type FoodBrowseLevelProps };
