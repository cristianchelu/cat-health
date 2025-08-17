import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FaWeight, FaCalendarAlt, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import { getPetWeightTrends } from '@/api/pets';
import './PetSummaryCard.css';

interface Pet {
  id: number;
  name: string;
  breed: string;
  birth_date: string;
}

interface PetSummaryCardProps {
  pet: Pet;
}

type TimePeriod = 'week' | 'month' | 'year';

export default function PetSummaryCard({ pet }: PetSummaryCardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('month');

  // Calculate days based on selected period
  const getDaysForPeriod = (period: TimePeriod): number => {
    switch (period) {
      case 'week': return 7;
      case 'month': return 30;
      case 'year': return 365;
      default: return 30;
    }
  };

  const days = getDaysForPeriod(selectedPeriod);

  const { data: trends } = useQuery({
    queryKey: ['weightTrends', pet.id, days],
    queryFn: () => getPetWeightTrends(pet.id, days),
  });

  const periodLabels = {
    week: '7d',
    month: '30d', 
    year: '1y',
  };

  // Calculate age in years
  const calculateAge = (birthDate: string): string => {
    const birth = new Date(birthDate);
    const now = new Date();
    const ageInYears = (now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return ageInYears.toFixed(1);
  };

  const calculateAgeInMonths = (birthDate: string): number => {
    const birth = new Date(birthDate);
    const now = new Date();
    const diffMonths = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    return diffMonths;
  };

  const currentAgeInMonths = calculateAgeInMonths(pet.birth_date);
  const isYoungCat = currentAgeInMonths < 18;

  // Calculate weight stats
  const getWeightStats = () => {
    if (!trends || trends.length === 0) {
      return {
        currentWeight: null,
        weightChange: null,
        trend: null,
        measurementCount: 0,
      };
    }

    // Group by date and get daily averages
    const dailyWeights = new Map<string, number[]>();
    trends.forEach(trend => {
      if (!dailyWeights.has(trend.date)) {
        dailyWeights.set(trend.date, []);
      }
      dailyWeights.get(trend.date)!.push(trend.weight);
    });

    const dailyAverages = Array.from(dailyWeights.entries())
      .map(([date, weights]) => ({
        date,
        weight: weights.reduce((sum, w) => sum + w, 0) / weights.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (dailyAverages.length === 0) {
      return {
        currentWeight: null,
        weightChange: null,
        trend: null,
        measurementCount: trends.length,
      };
    }

    const currentWeight = dailyAverages[dailyAverages.length - 1].weight;
    const firstWeight = dailyAverages[0].weight;
    const weightChange = dailyAverages.length > 1 ? currentWeight - firstWeight : 0;
    
    // Determine trend based on last week vs previous weeks
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (dailyAverages.length >= 7) {
      const lastWeekAvg = dailyAverages.slice(-7).reduce((sum, d) => sum + d.weight, 0) / 7;
      const prevWeekAvg = dailyAverages.slice(-14, -7).reduce((sum, d) => sum + d.weight, 0) / 7;
      if (dailyAverages.length >= 14) {
        const diff = lastWeekAvg - prevWeekAvg;
        if (diff > 50) trend = 'up'; // 50g increase
        else if (diff < -50) trend = 'down'; // 50g decrease
      }
    }

    return {
      currentWeight,
      weightChange,
      trend,
      measurementCount: trends.length,
    };
  };

  const weightStats = getWeightStats();

  return (
    <div className="pet-card">
      <div className="pet-card-header">{pet.name}</div>
      <div className="pet-card-content">
        <div className="pet-info-grid">
          <div>
            <div className="pet-info-label">Breed</div>
            <div className="pet-info-value">{pet.breed}</div>
          </div>
          <div>
            <div className="pet-info-label">
              <FaCalendarAlt />
              Age
            </div>
            <div className="pet-info-value">
              {calculateAge(pet.birth_date)} years
              {isYoungCat && <span className="pet-growth-tag">• Growing</span>}
            </div>
          </div>
        </div>

        {weightStats.currentWeight && (
          <div className="pet-weight-section">
            <div className="weight-grid">
              <div>
                <div className="weight-label">
                  <FaWeight />
                  Current Weight
                </div>
                <div className="weight-value">
                  {(weightStats.currentWeight / 1000).toFixed(2)} kg
                </div>
              </div>
              <div>
                <div className="weight-label">
                  {weightStats.trend === 'up' && <FaArrowUp className="weight-change-positive" />}
                  {weightStats.trend === 'down' && <FaArrowDown className="weight-change-negative" />}
                  Weight Change
                </div>
                <div className="period-buttons">
                  {(Object.keys(periodLabels) as TimePeriod[]).map((period) => (
                    <button
                      key={period}
                      onClick={() => setSelectedPeriod(period)}
                      className={`period-button ${selectedPeriod === period ? 'period-button-active' : ''}`}
                    >
                      {periodLabels[period]}
                    </button>
                  ))}
                </div>
                <div className={`weight-value ${
                  weightStats.weightChange && weightStats.weightChange > 0 
                    ? 'weight-change-positive' 
                    : weightStats.weightChange && weightStats.weightChange < 0 
                    ? 'weight-change-negative' 
                    : ''
                }`}>
                  {weightStats.weightChange && weightStats.weightChange > 0 ? '+' : ''}
                  {weightStats.weightChange ? (weightStats.weightChange / 1000).toFixed(2) : '0.00'} kg
                </div>
              </div>
            </div>
          </div>
        )}

        {weightStats.measurementCount > 0 && (
          <div className="weight-stats-footer">
            {weightStats.measurementCount} weight measurements in last {selectedPeriod === 'week' ? '7 days' : selectedPeriod === 'month' ? '30 days' : '365 days'}
          </div>
        )}
      </div>
    </div>
  );
}
