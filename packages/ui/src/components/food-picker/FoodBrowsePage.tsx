import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetFoodDTO } from 'shared';
import { SheetPageFrame } from '@/components/ui/SheetPageFrame';
import { FoodBrowseLevel } from './FoodBrowseLevel';
import { foodBrowseHeading } from './foodBrowseHeader';
import type { BrowseStep, FoodBrowseTree } from './foodLadder';

interface FoodBrowsePageProps {
  /** The rung on screen. The caller owns the stack, as everywhere else. */
  step: BrowseStep;
  tree: FoodBrowseTree;
  foods: readonly GetFoodDTO[];
  /** Names the root rung — the field this ladder fills. */
  title: string;
  selectedFoodId: number | null;
  onPush: (step: BrowseStep) => void;
  /** Picking reports and the caller walks out; nothing is written here. */
  onPick: (foodId: number | null) => void;
  /** Up one rung, or out to the host's own page at the root. */
  onBack: () => void;
  /** Copy for the row that means "no food row backs this". */
  noneLabel: string;
  noneHint: string;
}

/**
 * One rung of the food ladder as a level of the sheet you are already in —
 * the `SheetPageFrame` with the browse tree inside. `FoodPickerSheet` is
 * the same ladder for hosts with no page machinery of their own; a form that
 * already swaps pages under `SheetPages` mounts this instead, so the drawer
 * stays put and only its contents change.
 */
const FoodBrowsePage: React.FC<FoodBrowsePageProps> = ({
  step,
  tree,
  foods,
  title,
  selectedFoodId,
  onPush,
  onPick,
  onBack,
  noneLabel,
  noneHint,
}) => {
  const { t } = useTranslation();
  const header = foodBrowseHeading(step, tree, title, t);

  return (
    <SheetPageFrame
      title={header.heading}
      subtitle={header.sub ?? undefined}
      onBack={onBack}
    >
      <FoodBrowseLevel
        step={step}
        tree={tree}
        foods={foods}
        selectedFoodId={selectedFoodId}
        onPush={onPush}
        onPick={(food) => onPick(food.id)}
        none={{
          label: noneLabel,
          hint: noneHint,
          onPick: () => onPick(null),
        }}
      />
    </SheetPageFrame>
  );
};

export { FoodBrowsePage, type FoodBrowsePageProps };
