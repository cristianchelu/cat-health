import React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Drumstick } from 'lucide-react';

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
  const mockData: DayData[] = [
    { intake: 180, target: dailyTarget, tracked: true }, // Below target
    { intake: 240, target: dailyTarget, tracked: true }, // Above target
    { intake: 0, target: dailyTarget, tracked: false }, // Untracked
    { intake: 210, target: dailyTarget, tracked: true }, // Near target
    { intake: 230, target: dailyTarget, tracked: true }, // Slightly above
    { intake: 200, target: dailyTarget, tracked: true }, // Below target
    { intake: 150, target: dailyTarget, tracked: true }, // Today - below target
  ];

  // Define acceptable range (80% - 120% of target)
  const lowerBound = dailyTarget * 0.8; // 176 kcal
  const upperBound = dailyTarget * 1.2; // 264 kcal

  // Calculate today's total
  const todayIntake = mockData[mockData.length - 1].tracked
    ? mockData[mockData.length - 1].intake
    : 0;

  // Determine bar fill color based on intake vs bounds
  const getFillColor = (intake: number): string => {
    if (intake < lowerBound) return 'var(--color-warning)';
    if (intake > upperBound) return 'var(--color-danger)';
    return 'var(--color-success)';
  };

  return (
    <Card className="food-intake-card">
      <CardHeader>
        <Drumstick style={{ marginRight: 'auto' }} />
        <span className="intake-value">{todayIntake} kcal</span>
      </CardHeader>
      <CardContent>
        <div className="food-chart">
          <div className="bars-container">
            {mockData.map((day, index) => {
              if (!day.tracked) {
                // Untracked day - show diagonal stripes at full height
                return (
                  <div key={index} className="bar-wrapper">
                    <div className="bar-background">
                      <div className="bar-fill untracked" />
                    </div>
                  </div>
                );
              }

              // Calculate fill percentage relative to target
              const fillPercent = (day.intake / day.target) * 100;
              // Calculate reference line positions within the bar (80% and 120% of target)
              const lowerLinePercent = 80; // 80% of target
              const upperLinePercent = 120; // 120% of target

              // Determine if fill is above each reference line
              const lowerLineFilled = fillPercent >= lowerLinePercent;
              const upperLineFilled = fillPercent >= upperLinePercent;

              return (
                <div key={index} className="bar-wrapper">
                  <div className="bar-background">
                    {/* Lower bound reference line (80% of target) */}
                    <div
                      className={`bar-reference-line lower ${lowerLineFilled ? 'filled' : ''}`}
                      style={{
                        bottom: `${lowerLinePercent}%`,
                      }}
                    />
                    {/* Upper bound reference line (120% of target) */}
                    <div
                      className={`bar-reference-line upper ${upperLineFilled ? 'filled' : ''}`}
                      style={{
                        bottom: `${upperLinePercent}%`,
                      }}
                    />
                    {/* Actual intake fill */}
                    <div
                      className="bar-fill"
                      style={{
                        height: `${fillPercent}%`,
                        backgroundColor: getFillColor(day.intake),
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FoodIntakeCard;
