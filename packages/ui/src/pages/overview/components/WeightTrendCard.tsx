import React from 'react';
import { usePetWeightTrends } from '@/hooks/queries/petQueries';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { ArrowRight, Loader, Scale } from 'lucide-react';
import { formatRelative } from 'date-fns';
import { cn } from '@/lib/utils';

import './WeightTrendCard.css';

interface WeightTrendCardProps {
  petId: number;
}

// Catmull-Rom spline interpolation for smooth curves
const catmullRomSpline = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
) => {
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
};

// Create path for the line using Catmull-Rom splines
const createPath = (points: { x: number; y: number }[]) => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2)
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  // For each segment between points, create a smooth curve
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Add multiple points along the curve for smoothness
    const segments = 10; // Number of intermediate points per segment
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      const point = catmullRomSpline(p0, p1, p2, p3, t);

      if (i === 0 && j === 0) {
        // Skip the first point as it's already in the path
        continue;
      }

      path += ` L ${point.x} ${point.y}`;
    }
  }

  return path;
};

// Create area fill path
const createAreaPath = (points: { x: number; y: number }[], height: number) => {
  const linePath = createPath(points);
  if (!linePath) return '';

  return `${linePath} L ${points[points.length - 1].x} ${height} L 0 ${height} Z`;
};

const WeightTrendCard: React.FC<WeightTrendCardProps> = ({ petId }) => {
  const { data: weightData, isLoading, error } = usePetWeightTrends(petId, 15);

  if (isLoading) {
    return (
      <Card className="weight-trend-card">
        <CardHeader>
          <Scale style={{ marginRight: 'auto' }} />
          <ArrowRight className={cn('trend-icon')} />
          <span className="weight-value">-.-- kg</span>
        </CardHeader>
        <CardContent noPadding>
          <Loader />
        </CardContent>
      </Card>
    );
  }

  if (error || !weightData || weightData.length === 0) {
    return (
      <Card className="weight-trend-card">
        <CardHeader>
          <Scale style={{ marginRight: 'auto' }} />
          <ArrowRight className={cn('trend-icon')} />
          <span className="weight-value">-.-- kg</span>
        </CardHeader>
        <CardContent noPadding>
          <p>No weight data available</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate trend
  const latestWeight = weightData[weightData.length - 1]?.weight;
  const oldestWeight = weightData[0]?.weight;
  const weightChange = latestWeight - oldestWeight;
  const weightChangePercent =
    oldestWeight > 0 ? (weightChange / oldestWeight) * 100 : 0;

  const formatWeight = (weight: number) => {
    const weightInKg = weight / 1000;
    return `${weightInKg.toFixed(2)} kg`;
  };

  const trendInfo =
    Math.abs(weightChangePercent) < 1
      ? 'stable'
      : weightChangePercent > 0
        ? 'gaining'
        : 'losing';

  // Prepare data for SVG chart
  const weights = weightData.map((d) => d.weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);

  // Add 10% padding to the Y range
  const weightRange = maxWeight - minWeight || 1;
  const padding = weightRange * 0.1;
  const paddedMinWeight = minWeight - padding;
  const paddedMaxWeight = maxWeight + padding;
  const paddedWeightRange = paddedMaxWeight - paddedMinWeight;

  // SVG dimensions - maintain aspect ratio for "cover" behavior
  const width = 300;
  const height = 75;

  // Calculate points for the line (using pixel coordinates with padded range)
  const points = weightData.map((data, index) => {
    const x = (index / (weightData.length - 1)) * width;
    const y =
      (1 - (data.weight - paddedMinWeight) / paddedWeightRange) * height;
    return { x, y, weight: data.weight };
  });

  const timestamp = weightData.at(-1)?.timestamp;
  const timeLabel = timestamp
    ? formatRelative(new Date(timestamp), new Date())
    : '';

  return (
    <Card className="weight-trend-card">
      <CardHeader>
        <Scale style={{ marginRight: 'auto' }} />
        <div className="weight-trend-info">
          <ArrowRight className={cn('trend-icon', trendInfo)} />
          <div className="weight-value">{formatWeight(latestWeight)}</div>
          <div className="weight-time">{timeLabel}</div>
        </div>
      </CardHeader>
      <CardContent noPadding>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="weight-chart"
          preserveAspectRatio="xMaxYMax meet"
        >
          <defs>
            <linearGradient
              id="weightGradient"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity="0.3"
              />
              <stop
                offset="100%"
                stopColor="var(--color-primary)"
                stopOpacity="0.1"
              />
            </linearGradient>
          </defs>
          <path
            d={createAreaPath(points, height)}
            fill="url(#weightGradient)"
          />
          <path
            d={createPath(points)}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </CardContent>
    </Card>
  );
};

export default WeightTrendCard;
