import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetFoodDTO } from 'shared';
import { FoodFlatList } from './FoodFlatList';
import { PickerList } from '@/components/ui/PickerList';
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
      <PickerList
        leadingRow={leading}
        options={(node?.brands ?? []).map((brand) => ({
          value: brand.brand || NO_BRAND,
          label:
            brand.brand === NO_BRAND ? t('food_picker.no_brand') : brand.brand,
          muted: brand.brand === NO_BRAND,
          trailing: brand.foods.length,
          chevron: 'forward' as const,
        }))}
        onSelect={(value) =>
          onPush({
            kind: 'foods',
            group: step.group,
            brand: value === NO_BRAND ? NO_BRAND : value,
          })
        }
      />
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
    <PickerList
      leadingRow={leading}
      options={tree.map((node) => ({
        value: node.group,
        label: t(`food_picker.group_${node.group}`),
        trailing: node.foodCount,
        chevron: 'forward' as const,
      }))}
      onSelect={(value) => {
        /* The list speaks in strings; the group union is recovered from the
           tree that produced the option rather than asserted. */
        const node = tree.find((n) => n.group === value);
        if (node) onPush(stepForGroup(tree, node.group));
      }}
    />
  );
};

export { FoodBrowseLevel, type FoodBrowseLevelProps };
