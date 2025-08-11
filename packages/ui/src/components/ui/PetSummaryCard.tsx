import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FaWeight, FaCalendarAlt, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import { getPetWeightTrends } from '@/api/pets';

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
    <div className="card">
      <div className="card-title">{pet.name}</div>
      <div className="card-content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, color: '#666' }}>Breed</div>
            <div style={{ fontWeight: 'bold' }}>{pet.breed}</div>
          </div>
          <div>
            <div style={{ fontSize: 14, color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
              <FaCalendarAlt />
              Age
            </div>
            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4 }}>
              {calculateAge(pet.birth_date)} years
              {isYoungCat && <span style={{ fontSize: 12, color: '#4CAF50', fontWeight: 'normal' }}>• Growing</span>}
            </div>
          </div>
        </div>

        {weightStats.currentWeight && (
          <div style={{ 
            borderTop: '1px solid #eee', 
            paddingTop: 16,
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: 16 
          }}>
            <div>
              <div style={{ fontSize: 14, color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
                <FaWeight />
                Current Weight
              </div>
              <div style={{ fontWeight: 'bold', fontSize: 16 }}>
                {(weightStats.currentWeight / 1000).toFixed(2)} kg
              </div>
            </div>
            <div>
              <div style={{ 
                fontSize: 14, 
                color: '#666', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 4,
                marginBottom: 4 
              }}>
                {weightStats.trend === 'up' && <FaArrowUp style={{ color: '#4CAF50' }} />}
                {weightStats.trend === 'down' && <FaArrowDown style={{ color: '#f44336' }} />}
                Weight Change
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {(Object.keys(periodLabels) as TimePeriod[]).map((period) => (
                  <button
                    key={period}
                    onClick={() => setSelectedPeriod(period)}
                    style={{
                      padding: '2px 6px',
                      fontSize: 10,
                      border: '1px solid #ddd',
                      borderRadius: 3,
                      backgroundColor: selectedPeriod === period ? '#4CAF50' : 'white',
                      color: selectedPeriod === period ? 'white' : '#666',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {periodLabels[period]}
                  </button>
                ))}
              </div>
              <div style={{ 
                fontWeight: 'bold', 
                fontSize: 16,
                color: weightStats.weightChange && weightStats.weightChange > 0 
                  ? '#4CAF50' 
                  : weightStats.weightChange && weightStats.weightChange < 0 
                  ? '#f44336' 
                  : '#666'
              }}>
                {weightStats.weightChange && weightStats.weightChange > 0 ? '+' : ''}
                {weightStats.weightChange ? (weightStats.weightChange / 1000).toFixed(2) : '0.00'} kg
              </div>
            </div>
          </div>
        )}

        {weightStats.measurementCount > 0 && (
          <div style={{ 
            marginTop: 12, 
            fontSize: 12, 
            color: '#888',
            textAlign: 'center'
          }}>
            {weightStats.measurementCount} weight measurements in last {selectedPeriod === 'week' ? '7 days' : selectedPeriod === 'month' ? '30 days' : '365 days'}
          </div>
        )}
      </div>
    </div>
  );
}
