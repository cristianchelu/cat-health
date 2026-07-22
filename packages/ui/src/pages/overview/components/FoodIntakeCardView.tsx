import * as React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Drumstick } from 'lucide-react';
import MetricBarChart from '@/components/ui/MetricBarChart';
import { cn } from '@/lib/utils';

import './FoodIntakeCard.css';

export interface FoodIntakeSeriesPoint {
  value: number;
  tracked: boolean;
  lowerBound: number;
  upperBound: number;
}

export type FoodIntakeCardState =
  | { status: 'loading' }
  | { status: 'empty' }
  | {
      status: 'data';
      todayValue: number | null;
      series: FoodIntakeSeriesPoint[];
    };

export interface FoodIntakeCardViewProps {
  state: FoodIntakeCardState;
  /** Unit label shown next to the value (e.g. "kcal"). */
  unit: string;
  /** Text rendered in the chart slot when there is no data. */
  emptyLabel: string;
}

const PLACEHOLDER = '---';

const FoodIntakeCardView: React.FC<FoodIntakeCardViewProps> = ({
  state,
  unit,
  emptyLabel,
}) => {
  if (state.status === 'empty') {
    return (
      <Card className="food-intake-card">
        <CardHeader>
          <Drumstick style={{ marginRight: 'auto' }} />
          <span className="intake-value">
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
      <span className="intake-value">
        {PLACEHOLDER} {unit}
      </span>
    );
  } else {
    const { todayValue, series } = state;

    const maxAmount = Math.max(...series.map((d) => d.value));
    const maxUpperBound = Math.max(...series.map((d) => d.upperBound));
    const chartMax = Math.max(maxUpperBound * 1.2, maxAmount * 1.1);
    chart = <MetricBarChart data={series} maxValue={chartMax} />;

    headerValue =
      todayValue === null ? (
        <span className={cn('intake-value', 'intake-value--untracked')}>
          {PLACEHOLDER} {unit}
        </span>
      ) : (
        <span className="intake-value">
          {todayValue} {unit}
        </span>
      );
  }

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

export default FoodIntakeCardView;
