import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { GlassWater } from 'lucide-react';
import MetricBarChart from '@/components/ui/MetricBarChart';
import { usePetWaterTrends } from '@/hooks/queries/petQueries';

import './WaterConsumptionCard.css';

interface WaterConsumptionCardProps {
  petId: number;
}

const WaterConsumptionCard: React.FC<WaterConsumptionCardProps> = ({
  petId,
}) => {
  const { t } = useTranslation();
  const { data: waterData, isLoading, error } = usePetWaterTrends(petId, 7);

  const showEmpty =
    !isLoading && (error || !waterData || waterData.length === 0);

  if (showEmpty) {
    return (
      <Card className="water-consumption-card">
        <CardHeader>
          <GlassWater style={{ marginRight: 'auto' }} />
          <span className="consumption-value">--- ml</span>
        </CardHeader>
        <CardContent empty className="overview-metric-chart-slot">
          <p>{t('overview.no_water_data')}</p>
        </CardContent>
      </Card>
    );
  }

  let todayConsumption = 0;
  let chart: React.ReactNode = null;

  if (isLoading) {
    chart = null;
  } else if (waterData) {
    const todayData = waterData[waterData.length - 1];
    todayConsumption = Math.round(todayData.tracked ? todayData.amount : 0);

    const maxConsumption = Math.max(...waterData.map((d) => d.amount));
    const maxUpperBound = Math.max(...waterData.map((d) => d.upperBound));
    const chartMax = Math.max(maxUpperBound * 1.2, maxConsumption * 1.1);
    const chartData = waterData.map((day) => ({
      value: day.amount,
      tracked: day.tracked,
      lowerBound: day.lowerBound,
      upperBound: day.upperBound,
    }));
    chart = <MetricBarChart data={chartData} maxValue={chartMax} />;
  } else {
    chart = null;
  }

  const headerValue = isLoading ? (
    <span className="consumption-value">--- ml</span>
  ) : (
    <span className="consumption-value">{todayConsumption} ml</span>
  );

  return (
    <Card className="water-consumption-card" isLoading={isLoading}>
      <CardHeader>
        <GlassWater style={{ marginRight: 'auto' }} />
        {headerValue}
      </CardHeader>
      <CardContent className="overview-metric-chart-slot">{chart}</CardContent>
    </Card>
  );
};

export default WaterConsumptionCard;
