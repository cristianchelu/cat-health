import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetFoodDTO } from 'shared';
import { FoodFlatList } from './FoodFlatList';
import { PickerList } from '@/components/ui/PickerList';
import { PickerRow } from '@/components/ui/PickerRow';
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
  /** Rows above the browse list — Recent in the log flow. */
  leading?: React.ReactNode;
  /**
   * Copy for the root row that means "no food row backs this". One owner for
   * the row itself, so the hosts that offer unlinking (the feeder's bowl, the
   * event edit form) cannot drift into two versions of the same answer.
   * Selecting it calls `none.onPick`; the row shows selected while
   * `selectedFoodId` is null.
   */
  none?: { label: string; hint: string; onPick: () => void };
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
  none,
  selectedFoodId,
}) => {
  const { t } = useTranslation();

  /* Only at the root: unlinking is a choice about the whole field, so it sits
     among the top-level choices rather than inside one branch of them. */
  const leadingRows =
    step.kind === 'root' && none ? (
      <>
        <PickerRow
          title={none.label}
          subtitle={none.hint}
          muted
          selected={selectedFoodId === null}
          onClick={none.onPick}
        />
        {leading}
      </>
    ) : (
      leading
    );

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
        leadingRow={leadingRows}
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
        leadingRow={leadingRows}
      />
    );
  }

  return (
    <PickerList
      leadingRow={leadingRows}
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
