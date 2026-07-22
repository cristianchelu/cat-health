import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelative } from 'date-fns';
import { usePetWeightTrends } from '@/hooks/queries/petQueries';
import {
  useRegionalPreferences,
  useFormatters,
} from '@/contexts/RegionalPreferencesProvider';
import { formatCalendarDate } from '@/lib/utils';
import WeightTrendCardView, {
  type WeightTrendCardState,
  type WeightTrend,
} from './WeightTrendCardView';

interface WeightTrendCardProps {
  petId: number;
  isPending?: boolean;
}

const WEIGHT_PLACEHOLDER = '-.-- kg';

const WeightTrendCard: React.FC<WeightTrendCardProps> = ({
  petId,
  isPending = false,
}) => {
  const { t } = useTranslation();
  const { timezone } = useRegionalPreferences();
  const { formatDate, formatNumber } = useFormatters();
  const {
    data: weightData,
    isLoading: isQueryLoading,
    error,
  } = usePetWeightTrends(petId, 15);
  const isLoading = isQueryLoading || isPending;

  let state: WeightTrendCardState;
  if (
    !isLoading &&
    (error || !weightData || weightData.points.length === 0)
  ) {
    state = { status: 'empty' };
  } else if (isLoading || !weightData) {
    state = { status: 'loading' };
  } else {
    const points = weightData.points;
    const rangeEnd = new Date(weightData.rangeEnd).getTime();
    const todayKey = formatCalendarDate(new Date(), timezone);
    const todayPoint = points.find((point) => point.date === todayKey);
    const latestPoint = points[points.length - 1];

    const oldestWeight = points[0]?.weight ?? 0;
    const latestWeight = latestPoint?.weight ?? 0;
    const weightChange = latestWeight - oldestWeight;
    const weightChangePercent =
      oldestWeight > 0 ? (weightChange / oldestWeight) * 100 : 0;

    const trend: WeightTrend =
      Math.abs(weightChangePercent) < 1
        ? 'stable'
        : weightChangePercent > 0
          ? 'gaining'
          : 'losing';

    const formatWeight = (weight: number) =>
      `${formatNumber(weight / 1000, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} kg`;

    const headerWeight = !weightData.todayTracked
      ? null
      : (todayPoint?.weight ?? latestPoint?.weight ?? null);
    const headerWeightLabel =
      headerWeight == null ? null : formatWeight(headerWeight);

    const headerTimestamp = todayPoint?.timestamp ?? latestPoint?.timestamp;
    const timeLabel = headerTimestamp
      ? todayPoint
        ? formatRelative(new Date(headerTimestamp), new Date())
        : formatDate(new Date(headerTimestamp), 'short')
      : '';

    state = {
      status: 'data',
      points,
      rangeEnd,
      // Day-resolution litterbox-outage/pet-away gaps — the same whole-day
      // buckets that drive `todayTracked`, so a stale day renders as one hatch
      // block instead of fragmented hour-by-hour blips.
      untrackedIntervals: weightData.untrackedDayIntervals,
      trend,
      headerWeightLabel,
      timeLabel,
    };
  }

  return (
    <WeightTrendCardView
      state={state}
      emptyLabel={t('overview.no_weight_data')}
      placeholder={WEIGHT_PLACEHOLDER}
    />
  );
};

export default WeightTrendCard;
