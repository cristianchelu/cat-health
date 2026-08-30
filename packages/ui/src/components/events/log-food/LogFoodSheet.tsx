import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ScanBarcode } from 'lucide-react';
import type { GetFoodDTO } from 'shared';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Button } from '@/components/ui/Button';
import { MetaLine } from '@/components/ui/MetaLine';
import { LoadingState } from '@/components/ui/PageState';
import { FoodBrowseLevel } from '@/components/food-picker/FoodBrowseLevel';
import { PickerRow } from '@/components/ui/PickerRow';
import {
  intakeFoodType,
  kcalPerKilogram,
} from '@/components/food-picker/foodGroups';
import { useFoods } from '@/hooks/queries/foodQueries';
import {
  usePetFoodTrends,
  useRecentFoodIntakes,
} from '@/hooks/queries/petQueries';
import { addEvent } from '@/api/pets';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import type { DateRange } from '@/lib/utils';
import { isBarcodeScanSupported } from '@/lib/barcodeScan';
import { AmountStep } from './AmountStep';
import { FoodScanStep } from './FoodScanStep';
import {
  browseStepKey,
  buildFoodBrowseTree,
  findBrand,
  findGroup,
  isFlatMode,
  type BrowseStep,
  NO_BRAND,
} from '@/components/food-picker/foodLadder';
import { deriveRecentFoods, deriveUsualAmounts } from './recentFoods';
import './LogFoodSheet.css';

interface LogFoodSheetProps {
  isOpen: boolean;
  onClose: () => void;
  petId: number;
  petName: string;
  dateRange: DateRange;
  /** Overridable so tests do not have to fake browser APIs to see the action. */
  scanSupported?: boolean;
}

/**
 * Choosing a food and an amount, one decision per screen.
 *
 * The sheet is a picker, not a form: there is no draft to lose, so no discard
 * prompt guards it. Back walks up the ladder and out; the scrim and Escape
 * dismiss. Levels holding a single child are skipped when the step is pushed,
 * so walking back never lands somewhere the user has not been.
 */
const LogFoodSheet: React.FC<LogFoodSheetProps> = ({
  isOpen,
  onClose,
  petId,
  petName,
  dateRange,
  scanSupported = isBarcodeScanSupported(),
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { formatDate } = useFormatters();
  const { data: foods = [], isLoading: isLoadingFoods } = useFoods(isOpen);
  const { data: recentEvents } = useRecentFoodIntakes(petId, isOpen);
  const { data: foodTrends } = usePetFoodTrends(petId, 7);

  type LadderStep =
    | BrowseStep
    | { kind: 'amount'; foodId: number }
    | { kind: 'scan' };
  const [stack, setStack] = React.useState<LadderStep[]>([{ kind: 'root' }]);
  const step = stack[stack.length - 1];

  /* Always from the top. The sheet outlives its own close now — it has to, to
     have something to slide away — so reopening must not resume a ladder
     walked an hour ago. */
  React.useEffect(() => {
    if (isOpen) setStack([{ kind: 'root' }]);
  }, [isOpen]);

  const tree = React.useMemo(() => buildFoodBrowseTree(foods), [foods]);
  const foodsById = React.useMemo(
    () => new Map(foods.map((food) => [food.id, food])),
    [foods],
  );

  const recentEventList = React.useMemo(
    () => recentEvents?.data ?? [],
    [recentEvents],
  );
  const recentFoods = React.useMemo(
    () =>
      deriveRecentFoods(recentEventList).filter((row) =>
        foodsById.has(row.foodId),
      ),
    [recentEventList, foodsById],
  );
  const usualAmounts = React.useMemo(
    () => deriveUsualAmounts(recentEventList),
    [recentEventList],
  );

  const today = foodTrends?.at(-1);

  const addEventMutation = useMutation({
    mutationFn: (input: Parameters<typeof addEvent>[0]) => addEvent(input),
    onSuccess: () => {
      for (const queryKey of [
        ['petEvents', petId, dateRange],
        ['waterTrends', petId],
        ['foodTrends', petId],
        ['recentFoodIntakes', petId],
      ]) {
        queryClient.invalidateQueries({ queryKey });
      }
      onClose();
    },
  });

  const push = (next: LadderStep) => setStack((prev) => [...prev, next]);
  const back = () => {
    if (stack.length === 1) {
      onClose();
      return;
    }
    setStack((prev) => prev.slice(0, -1));
  };

  const pickFood = (food: GetFoodDTO) =>
    push({ kind: 'amount', foodId: food.id });

  const submit = (food: GetFoodDTO, amount: number) => {
    addEventMutation.mutate({
      parent_event_id: null,
      pet_id: petId,
      device_id: null,
      human_verified: true,
      data: {
        type: 'food_intake',
        food_type: intakeFoodType(food),
        amount,
        food_id: food.id,
      },
    });
  };

  const relativeDay = (timestamp: string) => {
    const logged = new Date(timestamp);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    if (logged >= midnight) return t('common.today');
    const yesterday = new Date(midnight);
    yesterday.setDate(yesterday.getDate() - 1);
    if (logged >= yesterday) return t('common.yesterday');
    return formatDate(logged);
  };

  const amountFood =
    step.kind === 'amount' ? (foodsById.get(step.foodId) ?? null) : null;

  const header = (() => {
    if (step.kind === 'amount' && amountFood) {
      const density = kcalPerKilogram(amountFood);
      return {
        title: amountFood.name,
        subtitle: (
          <MetaLine
            nowrap
            parts={[
              amountFood.brand,
              t(`food_picker.group_${intakeFoodType(amountFood)}`),
              amountFood.serving_size_g != null
                ? t('log_food.portion_pouch', {
                    size: amountFood.serving_size_g,
                  })
                : density != null
                  ? t('food_picker.kcal_per_kg', { value: density })
                  : null,
            ]}
          />
        ),
      };
    }
    if (step.kind === 'brands') {
      const node = findGroup(tree, step.group);
      return {
        title: t(`food_picker.group_${step.group}`),
        subtitle: t('log_food.brand_subtitle', {
          pet: petName,
          count: node?.foodCount ?? 0,
        }),
      };
    }
    if (step.kind === 'foods') {
      const node = findBrand(tree, step.group, step.brand);
      return {
        title: step.brand === NO_BRAND ? t('food_picker.no_brand') : step.brand,
        subtitle: t('log_food.food_subtitle', {
          group: t(`food_picker.group_${step.group}`),
          count: node?.foods.length ?? 0,
        }),
      };
    }
    if (step.kind === 'scan') {
      return { title: t('log_food.scan_title'), subtitle: petName };
    }
    return { title: t('log_food.title'), subtitle: petName };
  })();

  const body = (() => {
    if (step.kind === 'scan') {
      return (
        <FoodScanStep
          foods={foods}
          onMatch={(food) => push({ kind: 'amount', foodId: food.id })}
        />
      );
    }

    if (isLoadingFoods) return <LoadingState message={t('common.loading')} />;

    if (foods.length === 0) {
      return (
        <p className="log-food-empty">
          {t('settings.add_food_desc')}{' '}
          <Link to="/settings">{t('settings.foods')}</Link>
        </p>
      );
    }

    if (step.kind === 'amount') {
      if (!amountFood) return null;
      return (
        <AmountStep
          food={amountFood}
          petName={petName}
          initialAmount={
            usualAmounts.get(amountFood.id) ?? amountFood.serving_size_g ?? 50
          }
          todayKcal={today?.tracked ? today.amount : null}
          lowerBound={today?.lowerBound ?? null}
          upperBound={today?.upperBound ?? null}
          onSubmit={(amount) => submit(amountFood, amount)}
          isSubmitting={addEventMutation.isPending}
        />
      );
    }

    return (
      <FoodBrowseLevel
        step={step}
        tree={tree}
        foods={foods}
        onPush={push}
        onPick={pickFood}
        leading={
          /* Group headers only earn their place once the list is organized;
             a flat library has no groups for them to name. */
          step.kind === 'root' && !isFlatMode(foods) ? (
            <>
              {recentFoods.length > 0 && (
                <SectionLabel className="log-food-group-header">
                  {t('log_food.recent')}
                </SectionLabel>
              )}
              {recentFoods.map((row) => {
                const food = foodsById.get(row.foodId);
                if (!food) return null;
                return (
                  <PickerRow
                    key={row.foodId}
                    title={food.name}
                    subtitle={
                      <MetaLine
                        nowrap
                        parts={[
                          food.brand,
                          t(`food_picker.group_${intakeFoodType(food)}_short`),
                        ]}
                      />
                    }
                    trailing={t('log_food.recent_amount', {
                      when: relativeDay(row.lastTimestamp),
                      amount: row.lastAmount,
                    })}
                    onClick={() => pickFood(food)}
                  />
                );
              })}
              <SectionLabel className="log-food-group-header">
                {t('log_food.browse')}
              </SectionLabel>
            </>
          ) : null
        }
      />
    );
  })();

  /* Loading and empty states render under the top step's own key, so they
     swap in place rather than sliding — they are not navigation. */
  const pageKey =
    step.kind === 'amount'
      ? `amount:${step.foodId}`
      : step.kind === 'scan'
        ? 'scan'
        : browseStepKey(step);

  return (
    <PickerSheet
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      className="log-food-sheet"
      title={header.title}
      subtitle={header.subtitle}
      onBack={back}
      pageKey={pageKey}
      pageDepth={stack.length - 1}
      action={
        /* Only at the top of the ladder: deeper in, the choice the scan
           would make has already been made. */
        scanSupported && step.kind === 'root' && foods.length > 0 ? (
          <Button
            variant="ghost"
            icon
            onClick={() => push({ kind: 'scan' })}
            aria-label={t('log_food.scan_action')}
          >
            <ScanBarcode aria-hidden="true" />
          </Button>
        ) : null
      }
    >
      {body}
    </PickerSheet>
  );
};

export default LogFoodSheet;
export { LogFoodSheet, type LogFoodSheetProps };
