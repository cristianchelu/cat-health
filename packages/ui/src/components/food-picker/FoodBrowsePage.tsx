import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetFoodDTO } from 'shared';
import { SheetPageHeader } from '@/components/ui/SheetPageHeader';
import { PickerRow } from '@/components/ui/PickerRow';
import { FoodBrowseLevel } from './FoodBrowseLevel';
import { foodBrowseHeading } from './foodBrowseHeader';
import type { BrowseStep, FoodBrowseTree } from './foodLadder';
import './FoodBrowsePage.css';

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
 * the `SelectPage` shape with the browse tree inside. `FoodPickerSheet` is
 * the same ladder for hosts with no page machinery of their own; a form that
 * already swaps pages under `SheetPages` mounts this instead, so the drawer
 * stays put and only its contents change.
 *
 * Renders a `DialogTitle` via its header, so it must be mounted inside a
 * `Dialog` — it is a level of a sheet, never a standalone panel.
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
    <div className="food-browse-page">
      <SheetPageHeader
        className="food-browse-page-header"
        title={header.heading}
        subtitle={header.sub ?? undefined}
        onBack={onBack}
      />
      <div className="food-browse-page-body">
        <FoodBrowseLevel
          step={step}
          tree={tree}
          foods={foods}
          selectedFoodId={selectedFoodId}
          onPush={onPush}
          onPick={(food) => onPick(food.id)}
          leading={
            step.kind === 'root' ? (
              /* Unlinking is a choice about this field, so it sits among the
                 choices rather than behind a clear button. */
              <PickerRow
                title={noneLabel}
                subtitle={noneHint}
                muted
                selected={selectedFoodId === null}
                onClick={() => onPick(null)}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
};

export { FoodBrowsePage, type FoodBrowsePageProps };
