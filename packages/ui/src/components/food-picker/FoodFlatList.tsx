import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetFoodDTO } from 'shared';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/ui/StatusPill';
import { PickerList } from '@/components/ui/PickerList';
import type { PickerOption } from '@/components/ui/pickerOptions';
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

  /* Foods are the only food-shaped thing here; everything below is the list
     every other picker in the app uses. */
  const options: PickerOption[] = foods.map((food) => {
    const density = kcalPerKilogram(food);
    const group = coarseFoodGroup(food.food_type);
    return {
      value: String(food.id),
      label: food.name,
      subline: food.brand ?? undefined,
      trailing: (
        <>
          {showTypeTags && (
            <StatusPill className={cn('food-type-tag', group)}>
              {t(`food_picker.group_${group}_short`)}
            </StatusPill>
          )}
          {density != null && t('food_picker.kcal_per_kg', { value: density })}
        </>
      ),
    };
  });

  return (
    <PickerList
      className={cn('food-flat-list', className)}
      options={options}
      value={selectedFoodId != null ? String(selectedFoodId) : undefined}
      onSelect={(value) => {
        const food = foods.find((f) => String(f.id) === value);
        if (food) onSelect(food);
      }}
      leadingRow={leadingRow}
      emptyLabel={emptyLabel}
      {...props}
    />
  );
};

export { FoodFlatList, type FoodFlatListProps };
