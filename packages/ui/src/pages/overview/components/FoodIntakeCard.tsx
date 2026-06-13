import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Drumstick } from 'lucide-react';
import MetricBarChart from '@/components/ui/MetricBarChart';
import { usePetFoodTrends } from '@/hooks/queries/petQueries';
import { cn } from '@/lib/utils';

import './FoodIntakeCard.css';

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
  const { data: foodData, isLoading: isQueryLoading, error } =
    usePetFoodTrends(petId, DAYS);
  const isLoading = isQueryLoading || isPending;

  const showEmpty =
    !isLoading && (error || !foodData || foodData.length === 0);

  if (showEmpty) {
    return (
      <Card className="food-intake-card">
        <CardHeader>
          <Drumstick style={{ marginRight: 'auto' }} />
          <span className="intake-value">--- kcal</span>
        </CardHeader>
        <CardContent empty className="overview-metric-chart-slot">
          <p>{t('overview.no_activity')}</p>
        </CardContent>
      </Card>
    );
  }

  let todayKcal: number | null = null;
  let chart: React.ReactNode = null;

  if (isLoading) {
    chart = null;
  } else if (foodData) {
    const todayData = foodData[foodData.length - 1];
    todayKcal = todayData.tracked ? Math.round(todayData.amount) : null;

    const maxAmount = Math.max(...foodData.map((d) => d.amount));
    const maxUpperBound = Math.max(...foodData.map((d) => d.upperBound));
    const chartMax = Math.max(maxUpperBound * 1.2, maxAmount * 1.1);
    const chartData = foodData.map((day) => ({
      value: day.amount,
      tracked: day.tracked,
      lowerBound: day.lowerBound,
      upperBound: day.upperBound,
    }));
    chart = <MetricBarChart data={chartData} maxValue={chartMax} />;
  }

  const headerValue = isLoading ? (
    <span className="intake-value">--- kcal</span>
  ) : todayKcal === null ? (
    <span className={cn('intake-value', 'intake-value--untracked')}>
      --- kcal
    </span>
  ) : (
    <span className="intake-value">{todayKcal} kcal</span>
  );

  return (
    <Card className="food-intake-card" isLoading={isLoading}>
      <CardHeader>
        <Drumstick style={{ marginRight: 'auto' }} />
        {headerValue}
      </CardHeader>
      <CardContent className="overview-metric-chart-slot">{chart}</CardContent>
    </Card>
  );
};

export default FoodIntakeCard;
