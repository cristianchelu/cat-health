import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetFoodDTO } from 'shared';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/ui/StatusPill';
import { FoodPickerRow } from './FoodPickerRow';
import { coarseFoodGroup, kcalPerKilogram } from './foodGroups';
import './FoodFlatList.css';

interface FoodFlatListProps extends Omit<
  React.ComponentProps<'div'>,
  'onSelect'
> {
  foods: readonly GetFoodDTO[];
  selectedFoodId?: number | null;
  onSelect: (food: GetFoodDTO) => void;
  /**
   * A row rendered above the foods — the feeder's "Not linked" escape. Given
   * as a node so the caller owns its copy and its selected state.
   */
  leadingRow?: React.ReactNode;
  /**
   * Type tags per row. On for mixed lists (a small library with no groups to
   * stand in for them), off where a filter already says what the type is.
   */
  showTypeTags?: boolean;
  emptyLabel?: string;
}

/**
 * Every food in one list, no grouping. Used where the library is small enough
 * that organizing it would be ceremony, and where a filter has already cut it
 * down to one type.
 */
const FoodFlatList: React.FC<FoodFlatListProps> = ({
  foods,
  selectedFoodId,
  onSelect,
  leadingRow,
  showTypeTags = false,
  emptyLabel,
  className,
  ...props
}) => {
  const { t } = useTranslation();

  if (foods.length === 0 && leadingRow == null) {
    return (
      <div className={cn('food-flat-list', className)} {...props}>
        {emptyLabel != null && (
          <p className="food-flat-list-empty">{emptyLabel}</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('food-flat-list', className)} {...props}>
      {leadingRow}
      {foods.map((food) => {
        const density = kcalPerKilogram(food);
        const group = coarseFoodGroup(food.food_type);
        return (
          <FoodPickerRow
            key={food.id}
            title={food.name}
            subtitle={food.brand ?? undefined}
            selected={selectedFoodId === food.id}
            onClick={() => onSelect(food)}
            trailing={
              <>
                {showTypeTags && (
                  <StatusPill className={cn('food-type-tag', group)}>
                    {t(`food_picker.group_${group}_short`)}
                  </StatusPill>
                )}
                {density != null &&
                  t('food_picker.kcal_per_kg', { value: density })}
              </>
            }
          />
        );
      })}
    </div>
  );
};

export { FoodFlatList, type FoodFlatListProps };
