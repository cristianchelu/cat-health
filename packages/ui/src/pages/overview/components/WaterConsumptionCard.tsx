import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePetWaterTrends } from '@/hooks/queries/petQueries';
import WaterConsumptionCardView, {
  type WaterConsumptionCardState,
} from './WaterConsumptionCardView';

interface WaterConsumptionCardProps {
  petId: number;
  isPending?: boolean;
}

const DAYS = 7;

const WaterConsumptionCard: React.FC<WaterConsumptionCardProps> = ({
  petId,
  isPending = false,
}) => {
  const { t } = useTranslation();
  const {
    data: waterData,
    isLoading: isQueryLoading,
    error,
  } = usePetWaterTrends(petId, DAYS);
  const isLoading = isQueryLoading || isPending;

  let state: WaterConsumptionCardState;
  if (isLoading) {
    state = { status: 'loading' };
  } else if (error || !waterData || waterData.length === 0) {
    state = { status: 'empty' };
  } else {
    const todayData = waterData[waterData.length - 1];
    state = {
      status: 'data',
      todayValue: todayData.tracked ? Math.round(todayData.amount) : null,
      series: waterData.map((day) => ({
        value: day.amount,
        tracked: day.tracked,
        lowerBound: day.lowerBound,
        upperBound: day.upperBound,
      })),
    };
  }

  return (
    <WaterConsumptionCardView
      state={state}
      unit="ml"
      emptyLabel={t('overview.no_water_data')}
    />
  );
};

export default WaterConsumptionCard;
