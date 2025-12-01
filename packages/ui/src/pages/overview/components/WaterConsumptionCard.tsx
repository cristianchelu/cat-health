import React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { GlassWater } from 'lucide-react';

import './WaterConsumptionCard.css';

interface DayData {
  consumption: number; // ml consumed
  tracked: boolean; // false for untracked days
}

interface WaterConsumptionCardProps {
  petId: number;
}

const WaterConsumptionCard: React.FC<WaterConsumptionCardProps> = () => {
  // Mock data for 7 days
  // Assuming a 5kg cat: lower bound = 200ml (40ml/kg), upper bound = 300ml (60ml/kg)
  const mockData: DayData[] = [
    { consumption: 180, tracked: true }, // Below spec
    { consumption: 180, tracked: true }, // Below spec
    { consumption: 240, tracked: true }, // Within spec
    { consumption: 20, tracked: false }, // Untracked
    { consumption: 220, tracked: true }, // Within spec
    { consumption: 280, tracked: true }, // Within spec
    { consumption: 250, tracked: true }, // Within spec
    { consumption: 240, tracked: true }, // Within spec (today)
  ];

  // Mock cat weight (kg) - in real implementation, this would come from petId
  const catWeight = 5;
  const lowerBound = catWeight * 40; // 200ml
  const upperBound = catWeight * 60; // 300ml

  // Calculate today's total
  const todayConsumption = mockData[mockData.length - 1].tracked
    ? mockData[mockData.length - 1].consumption
    : 0;

  // Calculate max value for scaling (add 20% padding)
  const maxConsumption = Math.max(...mockData.map((d) => d.consumption));
  const chartMax = Math.max(upperBound * 1.2, maxConsumption * 1.1);

  // Determine bar color based on consumption
  const getBarColor = (consumption: number): string => {
    if (consumption < lowerBound) return 'var(--color-warning)';
    if (consumption > upperBound) return 'var(--color-water-light)';
    return 'var(--color-water)';
  };

  return (
    <Card className="water-consumption-card">
      <CardHeader>
        <GlassWater style={{ marginRight: 'auto' }} />
        <span className="consumption-value">{todayConsumption} ml</span>
      </CardHeader>
      <CardContent noPadding>
        <div className="water-chart">
          {/* Reference lines */}
          <div
            className="reference-line upper"
            style={{
              bottom: `${(upperBound / chartMax) * 100}%`,
            }}
          />
          <div
            className="reference-line lower"
            style={{
              bottom: `${(lowerBound / chartMax) * 100}%`,
            }}
          />

          {/* Bars */}
          <div className="bars-container">
            {mockData.map((day, index) => {
              const heightPercent = day.tracked
                ? (day.consumption / chartMax) * 100
                : 100; // Untracked days show at 100% height

              if (!day.tracked) {
                // Untracked day - show diagonal stripes
                return (
                  <div
                    key={index}
                    className="bar untracked"
                    style={{
                      height: `${heightPercent}%`,
                    }}
                  />
                );
              }

              // Normal tracked day
              return (
                <div
                  key={index}
                  className="bar"
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor: getBarColor(day.consumption),
                  }}
                />
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WaterConsumptionCard;
