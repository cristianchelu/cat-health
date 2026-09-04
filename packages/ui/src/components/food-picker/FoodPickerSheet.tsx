import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetFoodDTO } from 'shared';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { FoodBrowseLevel } from './FoodBrowseLevel';
import { PickerRow } from '@/components/ui/PickerRow';
import {
  browseStepKey,
  buildFoodBrowseTree,
  type BrowseStep,
} from './foodLadder';
import { foodBrowseHeading } from './foodBrowseHeader';
import './FoodPickerSheet.css';

interface FoodPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names what is being filled — the bowl, usually. */
  title: string;
  foods: readonly GetFoodDTO[];
  selectedFoodId: number | null;
  /** Picking reports and closes; nothing is written here. */
  onPick: (foodId: number | null) => void;
  /** Copy for the row that means "nothing in this bowl". */
  noneLabel: string;
  noneHint: string;
}

/**
 * The same ladder the log flow walks, used where a food fills a field rather
 * than becoming a meal. No search and no commit row: picking a food *is* the
 * decision, and the page it fills owns the Save.
 */
const FoodPickerSheet: React.FC<FoodPickerSheetProps> = ({
  open,
  onOpenChange,
  title,
  foods,
  selectedFoodId,
  onPick,
  noneLabel,
  noneHint,
}) => {
  const { t } = useTranslation();
  const tree = React.useMemo(() => buildFoodBrowseTree(foods), [foods]);

  /*
   * Always from the top. A feeder reports the food type it is *set to*, which
   * says what is in the bowl today — not what the bowl can take. Entering
   * inside that type would quietly rule out the other one, and changing the
   * food is the whole reason this sheet is open.
   */
  const [stack, setStack] = React.useState<BrowseStep[]>([{ kind: 'root' }]);

  React.useEffect(() => {
    if (open) setStack([{ kind: 'root' }]);
  }, [open]);

  const step = stack[stack.length - 1];

  const back = () => {
    if (stack.length === 1) {
      onOpenChange(false);
      return;
    }
    setStack((prev) => prev.slice(0, -1));
  };

  const follow = (next: BrowseStep) => setStack((prev) => [...prev, next]);

  const header = foodBrowseHeading(step, tree, title, t);

  return (
    <PickerSheet
      open={open}
      onOpenChange={onOpenChange}
      className="food-picker-sheet"
      title={header.heading}
      subtitle={header.sub ?? undefined}
      onBack={back}
      pageKey={browseStepKey(step)}
      pageDepth={stack.length - 1}
    >
      <FoodBrowseLevel
        step={step}
        tree={tree}
        foods={foods}
        selectedFoodId={selectedFoodId}
        onPush={follow}
        onPick={(food) => onPick(food.id)}
        leading={
          step.kind === 'root' ? (
            /* Unlinking is a choice about this bowl, so it sits among the
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
    </PickerSheet>
  );
};

export { FoodPickerSheet, type FoodPickerSheetProps };
