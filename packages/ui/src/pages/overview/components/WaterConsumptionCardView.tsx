import * as React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { GlassWater } from 'lucide-react';
import MetricBarChart from '@/components/ui/MetricBarChart';
import { cn } from '@/lib/utils';

import './WaterConsumptionCard.css';

export interface WaterConsumptionSeriesPoint {
  value: number;
  tracked: boolean;
  lowerBound: number;
  upperBound: number;
}

export type WaterConsumptionCardState =
  | { status: 'loading' }
  | { status: 'empty' }
  | {
      status: 'data';
      todayValue: number | null;
      series: WaterConsumptionSeriesPoint[];
    };

export interface WaterConsumptionCardViewProps {
  state: WaterConsumptionCardState;
  /** Unit label shown next to the value (e.g. "ml"). */
  unit: string;
  /** Text rendered in the chart slot when there is no data. */
  emptyLabel: string;
}

const PLACEHOLDER = '---';

const WaterConsumptionCardView: React.FC<WaterConsumptionCardViewProps> = ({
  state,
  unit,
  emptyLabel,
}) => {
  if (state.status === 'empty') {
    return (
      <Card className="water-consumption-card">
        <CardHeader>
          <GlassWater style={{ marginRight: 'auto' }} />
          <span className="consumption-value">
            {PLACEHOLDER} {unit}
          </span>
        </CardHeader>
        <CardContent empty className="overview-metric-chart-slot">
          <p>{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }

  const isLoading = state.status === 'loading';

  let chart: React.ReactNode = null;
  let headerValue: React.ReactNode;

  if (isLoading) {
    headerValue = (
      <span className="consumption-value">
        {PLACEHOLDER} {unit}
      </span>
    );
  } else {
    const { todayValue, series } = state;

    const maxConsumption = Math.max(...series.map((d) => d.value));
    const maxUpperBound = Math.max(...series.map((d) => d.upperBound));
    const chartMax = Math.max(maxUpperBound * 1.2, maxConsumption * 1.1);
    chart = <MetricBarChart data={series} maxValue={chartMax} />;

    headerValue =
      todayValue === null ? (
        <span
          className={cn('consumption-value', 'consumption-value--untracked')}
        >
          {PLACEHOLDER} {unit}
        </span>
      ) : (
        <span className="consumption-value">
          {todayValue} {unit}
        </span>
      );
  }

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

export default WaterConsumptionCardView;
