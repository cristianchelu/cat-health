import React from 'react';
import { useTranslation } from 'react-i18next';
import { subDays, format } from 'date-fns';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Drumstick, Loader } from 'lucide-react';
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
}

const DAYS = 7;
const DEFAULT_DAILY_TARGET_KCAL = 220;
const TARGET_MIN = DEFAULT_DAILY_TARGET_KCAL * 0.8;
const TARGET_MAX = DEFAULT_DAILY_TARGET_KCAL * 1.2;

const FoodIntakeCard: React.FC<FoodIntakeCardProps> = ({ petId }) => {
  const { t } = useTranslation();
  const today = new Date();
  const startDate = subDays(today, DAYS - 1);
  const startTime = new Date(
    format(startDate, 'yyyy-MM-dd') + 'T00:00:00.000Z',
  ).toISOString();
  const endTime = new Date(
    format(today, 'yyyy-MM-dd') + 'T23:59:59.999Z',
  ).toISOString();

  const { data: eventsResponse, isLoading, error } = useQuery({
    queryKey: ['petEvents', petId, 'foodTrends', startTime, endTime],
    queryFn: () => getPetEvents(petId, startTime, endTime, 500),
    enabled: petId > 0,
  });

  if (isLoading) {
    return (
      <Card className="food-intake-card">
        <CardHeader>
          <Drumstick style={{ marginRight: 'auto' }} />
          <span className="intake-value">--- kcal</span>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-full">
            <Loader className="animate-spin" />
          </div>
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
    const dateStr = format(d, 'yyyy-MM-dd');
    dailyCalories.set(dateStr, 0);
  }
  for (const ev of foodEvents) {
    const dateStr = format(new Date(ev.timestamp), 'yyyy-MM-dd');
    const data = ev.data as { nutrients?: { calories?: number } };
    const kcal = data.nutrients?.calories ?? 0;
    dailyCalories.set(
      dateStr,
      (dailyCalories.get(dateStr) ?? 0) + kcal,
    );
  }

  const chartData: DayData[] = [];
  for (let i = 0; i < DAYS; i++) {
    const d = subDays(today, DAYS - 1 - i);
    const dateStr = format(d, 'yyyy-MM-dd');
    const value = dailyCalories.get(dateStr) ?? 0;
    chartData.push({
      value,
      tracked: value > 0,
      lowerBound: TARGET_MIN,
      upperBound: TARGET_MAX,
    });
  }

  const todayStr = format(today, 'yyyy-MM-dd');
  const todayKcal = dailyCalories.get(todayStr) ?? 0;
  const maxValue = Math.max(
    ...chartData.map((d) => d.value),
    TARGET_MAX,
  ) * 1.2;

  if (error) {
    return (
      <Card className="food-intake-card">
        <CardHeader>
          <Drumstick style={{ marginRight: 'auto' }} />
          <span className="intake-value">--- kcal</span>
        </CardHeader>
        <CardContent empty>
          <p>{t('overview.no_activity')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="food-intake-card">
      <CardHeader>
        <Drumstick style={{ marginRight: 'auto' }} />
        <span className="intake-value">{todayKcal} kcal</span>
      </CardHeader>
      <CardContent>
        <MetricBarChart
          data={chartData}
          maxValue={maxValue}
          lowerBound={TARGET_MIN}
          upperBound={TARGET_MAX}
        />
      </CardContent>
    </Card>
  );
};

export default FoodIntakeCard;
