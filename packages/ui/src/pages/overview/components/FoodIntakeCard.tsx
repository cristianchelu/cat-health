import React from 'react';
import { useTranslation } from 'react-i18next';
import { subDays, format } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Drumstick } from 'lucide-react';
import MetricBarChart from '@/components/ui/MetricBarChart';
import { useQuery } from '@tanstack/react-query';
import { getPetEvents } from '@/api/pets';

import './FoodIntakeCard.css';

interface DayData {
  value: number;
  tracked: boolean;
  lowerBound?: number;
  upperBound?: number;
}

interface FoodIntakeCardProps {
  petId: number;
  isPending?: boolean;
}

const DAYS = 7;
const DEFAULT_DAILY_TARGET_KCAL = 220;
const TARGET_MIN = DEFAULT_DAILY_TARGET_KCAL * 0.8;
const TARGET_MAX = DEFAULT_DAILY_TARGET_KCAL * 1.2;

const FoodIntakeCard: React.FC<FoodIntakeCardProps> = ({
  petId,
  isPending = false,
}) => {
  const { t } = useTranslation();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date();
  const startDate = subDays(today, DAYS - 1);

  const { dateToTimeRange } = React.useMemo(() => {
    return {
      dateToTimeRange: (date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const start = fromZonedTime(`${dateStr}T00:00:00.000`, timezone);
        const end = fromZonedTime(`${dateStr}T23:59:59.999`, timezone);
        return { start: start.toISOString(), end: end.toISOString() };
      },
    };
  }, [timezone]);

  const startTime = dateToTimeRange(startDate).start;
  const endTime = dateToTimeRange(today).end;

  const { data: eventsResponse, isLoading: isQueryLoading, error } = useQuery({
    queryKey: ['petEvents', petId, 'foodTrends', startTime, endTime, timezone],
    queryFn: () => getPetEvents(petId, startTime, endTime, 500),
    enabled: petId > 0,
  });
  const isLoading = isQueryLoading || isPending;

  if (error && !isLoading) {
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

  const events = eventsResponse?.data ?? [];
  const foodEvents = events.filter(
    (ev) => ev.data && (ev.data as { type: string }).type === 'food_intake',
  );

  const dailyCalories = new Map<string, number>();
  for (let i = 0; i < DAYS; i++) {
    const d = subDays(today, DAYS - 1 - i);
    const dateStr = formatInTimeZone(d, timezone, 'yyyy-MM-dd');
    dailyCalories.set(dateStr, 0);
  }
  for (const ev of foodEvents) {
    const dateStr = formatInTimeZone(
      new Date(ev.timestamp),
      timezone,
      'yyyy-MM-dd',
    );
    const data = ev.data as { nutrients?: { calories?: number } };
    const kcal = Math.round(data.nutrients?.calories ?? 0);
    dailyCalories.set(dateStr, (dailyCalories.get(dateStr) ?? 0) + kcal);
  }

  const chartData: DayData[] = [];
  for (let i = 0; i < DAYS; i++) {
    const d = subDays(today, DAYS - 1 - i);
    const dateStr = formatInTimeZone(d, timezone, 'yyyy-MM-dd');
    const value = dailyCalories.get(dateStr) ?? 0;
    chartData.push({
      value,
      tracked: value > 0,
      lowerBound: TARGET_MIN,
      upperBound: TARGET_MAX,
    });
  }

  const todayStr = formatInTimeZone(today, timezone, 'yyyy-MM-dd');
  const todayKcal = dailyCalories.get(todayStr) ?? 0;
  const maxValue =
    Math.max(...chartData.map((d) => d.value), TARGET_MAX) * 1.2;

  const headerValue = isLoading ? (
    <span className="intake-value">--- kcal</span>
  ) : (
    <span className="intake-value">{todayKcal} kcal</span>
  );

  const chart = isLoading ? null : (
    <MetricBarChart
      data={chartData}
      maxValue={maxValue}
      lowerBound={TARGET_MIN}
      upperBound={TARGET_MAX}
    />
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
