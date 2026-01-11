import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { GlassWater, Loader } from 'lucide-react';
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

  if (isLoading) {
    return (
      <Card className="water-consumption-card">
        <CardHeader>
          <GlassWater style={{ marginRight: 'auto' }} />
          <span className="consumption-value">--- ml</span>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-full">
            <Loader className="animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !waterData || waterData.length === 0) {
    return (
      <Card className="water-consumption-card">
        <CardHeader>
          <GlassWater style={{ marginRight: 'auto' }} />
          <span className="consumption-value">--- ml</span>
        </CardHeader>
        <CardContent empty>
          <p>{t('overview.no_water_data')}</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate today's total (last item)
  const todayData = waterData[waterData.length - 1];
  const todayConsumption = todayData.tracked ? todayData.amount : 0;

  // Calculate max value for scaling (add 20% padding)
  const maxConsumption = Math.max(...waterData.map((d) => d.amount));
  const maxUpperBound = Math.max(...waterData.map((d) => d.upperBound));
  const chartMax = Math.max(maxUpperBound * 1.2, maxConsumption * 1.1);

  // Transform data for MetricBarChart
  const chartData = waterData.map((day) => ({
    value: day.amount,
    tracked: day.tracked,
    lowerBound: day.lowerBound,
    upperBound: day.upperBound,
  }));

  return (
    <Card className="water-consumption-card">
      <CardHeader>
        <GlassWater style={{ marginRight: 'auto' }} />
        <span className="consumption-value">{todayConsumption} ml</span>
      </CardHeader>
      <CardContent>
        <MetricBarChart data={chartData} maxValue={chartMax} />
      </CardContent>
    </Card>
  );
};

export default WaterConsumptionCard;
