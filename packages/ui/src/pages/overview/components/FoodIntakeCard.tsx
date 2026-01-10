import React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Drumstick } from 'lucide-react';
import MetricBarChart from '@/components/ui/MetricBarChart';

import './FoodIntakeCard.css';

interface DayData {
  intake: number; // kcal consumed
  target: number; // kcal target for this day
  tracked: boolean; // false for untracked days
}

interface FoodIntakeCardProps {
  petId: number;
}

const FoodIntakeCard: React.FC<FoodIntakeCardProps> = () => {
  // Mock data for 7 days
  // Assuming a 5kg cat: typical target = 220 kcal/day
  const dailyTarget = 220;
  const dailyMin = dailyTarget * 0.8; // 176 kcal
  const dailyMax = dailyTarget * 1.2; // 264 kcal

  const mockData: DayData[] = [
    { intake: 180, target: dailyTarget, tracked: true }, // Below target
    { intake: 240, target: dailyTarget, tracked: true }, // Above target
    { intake: 0, target: dailyTarget, tracked: false }, // Untracked
    { intake: 210, target: dailyTarget, tracked: true }, // Near target
    { intake: 230, target: dailyTarget, tracked: true }, // Slightly above
    { intake: 200, target: dailyTarget * 0.8, tracked: true }, // Below target
    { intake: 150, target: dailyTarget * 0.9, tracked: true }, // Today - below target
  ];

  const maxTarget =
    mockData.reduce((a, v) => (v.target > a ? v.target : a), 0) * 1.4;

  // Calculate today's total
  const todayIntake = mockData[mockData.length - 1].tracked
    ? mockData[mockData.length - 1].intake
    : 0;

  // Transform data for MetricBarChart
  const chartData = mockData.map((day) => ({
    value: day.intake,
    tracked: day.tracked,
  }));

  return (
    <Card className="food-intake-card">
      <CardHeader>
        <Drumstick style={{ marginRight: 'auto' }} />
        <span className="intake-value">{todayIntake} kcal</span>
      </CardHeader>
      <CardContent>
        <MetricBarChart
          data={chartData}
          maxValue={maxTarget}
          lowerBound={dailyMin}
          upperBound={dailyMax}
        />
      </CardContent>
    </Card>
  );
};

export default FoodIntakeCard;
