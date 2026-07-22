import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePetFoodTrends } from '@/hooks/queries/petQueries';
import FoodIntakeCardView, {
  type FoodIntakeCardState,
} from './FoodIntakeCardView';

interface FoodIntakeCardProps {
  petId: number;
  isPending?: boolean;
}

const DAYS = 7;

const FoodIntakeCard: React.FC<FoodIntakeCardProps> = ({
  petId,
  isPending = false,
}) => {
  const { t } = useTranslation();
  const {
    data: foodData,
    isLoading: isQueryLoading,
    error,
  } = usePetFoodTrends(petId, DAYS);
  const isLoading = isQueryLoading || isPending;

  let state: FoodIntakeCardState;
  if (isLoading) {
    state = { status: 'loading' };
  } else if (error || !foodData || foodData.length === 0) {
    state = { status: 'empty' };
  } else {
    const todayData = foodData[foodData.length - 1];
    state = {
      status: 'data',
      todayValue: todayData.tracked ? Math.round(todayData.amount) : null,
      series: foodData.map((day) => ({
        value: day.amount,
        tracked: day.tracked,
        lowerBound: day.lowerBound,
        upperBound: day.upperBound,
      })),
    };
  }

  return (
    <FoodIntakeCardView
      state={state}
      unit="kcal"
      emptyLabel={t('overview.no_activity')}
    />
  );
};

export default FoodIntakeCard;
