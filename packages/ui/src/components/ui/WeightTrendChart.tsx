import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useState } from 'react';
import { Select } from './form';
import { Card, CardContent, CardHeader } from './Card';
import { cn } from '@/lib/utils';
import { usePetWeightTrends } from '@/hooks/queries/petQueries';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type TimePeriod = 'week' | 'month' | 'year' | 'all';

interface WeightTrendChartProps {
  petId: number;
  petName: string;
  petBirthDate: string;
  height?: number;
  className?: string;
}

export default function WeightTrendChart({ 
  petId, 
  petName, 
  petBirthDate,
  height = 250,
  className
}: WeightTrendChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('month');

  // Calculate pet's current age
  const calculateAgeInMonths = (birthDate: string): number => {
    const birth = new Date(birthDate);
    const now = new Date();
    const diffMonths = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    return diffMonths;
  };

  const currentAgeInMonths = calculateAgeInMonths(petBirthDate);
  const isYoungCat = currentAgeInMonths < 18; // Less than 1.5 years old

  // Growth expectations for kittens (approximate ranges in grams)
  const getExpectedWeightRange = (ageInMonths: number): { min: number; max: number } | null => {
    if (ageInMonths < 1) return { min: 400, max: 800 }; // 0.4-0.8 kg
    if (ageInMonths < 2) return { min: 700, max: 1200 }; // 0.7-1.2 kg
    if (ageInMonths < 3) return { min: 1000, max: 1800 }; // 1.0-1.8 kg
    if (ageInMonths < 4) return { min: 1500, max: 2500 }; // 1.5-2.5 kg
    if (ageInMonths < 6) return { min: 2000, max: 3500 }; // 2.0-3.5 kg
    if (ageInMonths < 12) return { min: 2500, max: 4500 }; // 2.5-4.5 kg
    if (ageInMonths < 18) return { min: 3000, max: 5500 }; // 3.0-5.5 kg (still growing)
    return null; // Adult cat, no specific growth expectations
  };

  const getAgeDescription = (ageInMonths: number, ageInDays: number): string => {
    if (ageInMonths < 1) return `${ageInDays} days old`;
    if (ageInMonths < 12) return `${ageInMonths} months old`;
    const years = Math.floor(ageInMonths / 12);
    const months = ageInMonths % 12;
    if (months === 0) return `${years} year${years > 1 ? 's' : ''} old`;
    return `${years}y ${months}m old`;
  };

  // Calculate days based on selected period
  const getDaysForPeriod = (period: TimePeriod): number => {
    switch (period) {
      case 'week': return 7;
      case 'month': return 30;
      case 'year': return 365;
      case 'all': return 9999; // Large number to get all data
      default: return 30;
    }
  };

  const days = getDaysForPeriod(selectedPeriod);

  const { data: trends, isLoading, error } = usePetWeightTrends(petId, days);

  const periodLabels = {
    week: 'Week',
    month: 'Month',
    year: 'Year',
    all: 'All'
  };

  if (isLoading) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading weight trends...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Error loading weight trends
      </div>
    );
  }

  if (!trends || trends.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        No weight data available for the last {days} days
      </div>
    );
  }

  // Group measurements by date and calculate daily averages
  const dailyWeights = new Map<string, { total: number; count: number; timestamps: string[] }>();
  
  trends.forEach((trend) => {
    let groupKey = trend.date;
    
    // For longer periods, group by week or month instead of day
    if (selectedPeriod === 'year') {
      // Group by week for year view
      const date = new Date(trend.date);
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      groupKey = startOfWeek.toISOString().split('T')[0];
    } else if (selectedPeriod === 'all') {
      // Group by month for all-time view
      const date = new Date(trend.date);
      groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    }
    
    if (!dailyWeights.has(groupKey)) {
      dailyWeights.set(groupKey, { total: 0, count: 0, timestamps: [] });
    }
    const group = dailyWeights.get(groupKey)!;
    group.total += trend.weight;
    group.count += 1;
    group.timestamps.push(trend.timestamp);
  });

  // Convert to chart data with age context
  const chartData = Array.from(dailyWeights.entries())
    .map(([date, data]) => {
      const dataDate = new Date(date);
      const birthDate = new Date(petBirthDate);
      const ageInMonths = (dataDate.getFullYear() - birthDate.getFullYear()) * 12 + 
                         (dataDate.getMonth() - birthDate.getMonth());
      const ageInDays = Math.floor((dataDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        date,
        weight: data.total / data.count, // Average weight for the period
        count: data.count,
        timestamps: data.timestamps,
        ageInMonths,
        ageInDays,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const labels = chartData.map(item => {
    const date = new Date(item.date);
    if (selectedPeriod === 'week') {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else if (selectedPeriod === 'month') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (selectedPeriod === 'year') {
      // Show week starting date for year view
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      // all time - show month/year for monthly grouping
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  });

  const weights = chartData.map(item => item.weight / 1000); // Convert grams to kg

  // Calculate trend
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const latestWeight = weights[weights.length - 1];
  const firstWeight = weights[0];
  const weightChange = weights.length > 1 ? latestWeight - firstWeight : 0;

  // Adjust point size based on period (fewer points for longer periods)
  const getPointRadius = () => {
    switch (selectedPeriod) {
      case 'week': return 4;
      case 'month': return 3;
      case 'year': return 2;
      case 'all': return 2;
      default: return 3;
    }
  };

  const data = {
    labels,
    datasets: [
      {
        label: `${petName} Weight (kg)`,
        data: weights,
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        fill: true,
        pointRadius: getPointRadius(),
        pointHoverRadius: getPointRadius() + 2,
        pointBackgroundColor: '#4CAF50',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        tension: selectedPeriod === 'all' ? 0.4 : 0.3, // Smoother line for all-time view
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: { dataIndex: number; parsed: { y: number } }) => {
            const dataPoint = chartData[context.dataIndex];
            const periodText = selectedPeriod === 'year' ? 'week' : selectedPeriod === 'all' ? 'month' : 'day';
            const weightInGrams = dataPoint.weight;
            const expectedRange = getExpectedWeightRange(dataPoint.ageInMonths);
            const ageDesc = getAgeDescription(dataPoint.ageInMonths, dataPoint.ageInDays);
            
            const tooltipLines = [
              `Average Weight: ${context.parsed.y.toFixed(2)} kg`,
              `Age: ${ageDesc}`,
              `Measurements: ${dataPoint.count} in this ${periodText}`,
            ];

            // Add growth context for young cats
            if (expectedRange) {
              const minKg = (expectedRange.min / 1000).toFixed(1);
              const maxKg = (expectedRange.max / 1000).toFixed(1);
              const isInRange = weightInGrams >= expectedRange.min && weightInGrams <= expectedRange.max;
              
              tooltipLines.push(`Expected range: ${minKg}-${maxKg} kg ${isInRange ? '✓' : '⚠️'}`);
              
              if (!isInRange) {
                if (weightInGrams < expectedRange.min) {
                  tooltipLines.push('⚠️ Below expected range for age');
                } else {
                  tooltipLines.push('⚠️ Above expected range for age');
                }
              }
            }

            return tooltipLines;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        min: Math.max(0, minWeight - 0.2),
        max: maxWeight + 0.2,
        ticks: {
          callback: (value: string | number) => `${Number(value).toFixed(1)} kg`,
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxTicksLimit: selectedPeriod === 'all' ? 8 : selectedPeriod === 'year' ? 12 : 15,
        },
      },
    },
  };

  return (
    <Card className={`chart-card ${className || ''}`}>
      <CardHeader>
          <h3>
            Weight Trend
            <div>
              <span className="latest-weight">{latestWeight?.toFixed(2)} kg</span>
              <span className={cn("weight-change", {
                'indicator-normal': weightChange > 0,
                'indicator-warning': weightChange < 0,
              })}>{weightChange.toFixed(2)} kg</span>
            </div>
            </h3>
          {isYoungCat && (
            <div className="form-helper">
              Growing kitten • {getAgeDescription(currentAgeInMonths, Math.floor((new Date().getTime() - new Date(petBirthDate).getTime()) / (1000 * 60 * 60 * 24)))}
            </div>
          )}
        <Select
          value={selectedPeriod}
          onChange={e => setSelectedPeriod(e.target.value as TimePeriod)}
          options={(Object.keys(periodLabels) as TimePeriod[]).map(period => ({
            value: period,
            label: periodLabels[period],
          }))}
          aria-label="Select period"
        />
      </CardHeader>

      <CardContent className="chart-container" style={{ height }}>
        <Line data={data} options={options} />
      </CardContent>
    </Card>
  );
}
