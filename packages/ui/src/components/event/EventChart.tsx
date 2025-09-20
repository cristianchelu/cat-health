import * as React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import './EventChart.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

export interface ChartData {
  timestamps: number[];
  weights: number[];
}

export interface ContextData {
  wasteWeight: number | null;
  litterRemaining: number | null;
  deepCleanTimer: number | null;
  totalVisits: number | null;
  daysSinceLitterReplaced: number | null;
  hoursSinceLastScoop: number | null;
}

export interface EventChartButtonProps {
  data: ChartData;
  isExpanded: boolean;
  onToggle: () => void;
  title?: string;
  borderColor?: string;
  backgroundColor?: string;
}

export interface EventExpandedSectionProps {
  children: React.ReactNode;
  className?: string;
}

export interface EventContextDataProps {
  context: ContextData;
}

export interface EventExpandedChartProps {
  data: ChartData;
  borderColor?: string;
  backgroundColor?: string;
}

const EventChartButton = React.forwardRef<
  HTMLButtonElement,
  EventChartButtonProps
>(
  (
    {
      data,
      isExpanded,
      onToggle,
      title = isExpanded ? 'Hide chart' : 'Expand chart',
      borderColor = 'rgb(75, 192, 192)',
      backgroundColor = 'rgba(75, 192, 192, 0.2)',
    },
    ref,
  ) => {
    const chartData = {
      labels: data.timestamps.map((t) => (t / 1000).toFixed(1)),
      datasets: [
        {
          label: 'Weight (grams)',
          data: data.weights,
          borderColor,
          backgroundColor,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2,
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      events: [], // disables all interactivity
      scales: {
        x: { display: false },
        y: { display: false },
      },
      animation: { duration: 0 },
    };

    if (data.weights.length === 0) {
      return null;
    }

    return (
      <button
        ref={ref}
        className="event-chart-button"
        onClick={onToggle}
        title={title}
      >
        <Line data={chartData} options={options} height={28} width={80} />
      </button>
    );
  },
);

EventChartButton.displayName = 'EventChartButton';

const EventExpandedSection = React.forwardRef<
  HTMLDivElement,
  EventExpandedSectionProps
>(({ children, className }, ref) => {
  return (
    <div ref={ref} className={`event-expanded-section ${className || ''}`}>
      {children}
    </div>
  );
});

EventExpandedSection.displayName = 'EventExpandedSection';

const EventContextData = React.forwardRef<
  HTMLDivElement,
  EventContextDataProps
>(({ context }, ref) => {
  const hasContextData =
    context.wasteWeight !== null ||
    context.litterRemaining !== null ||
    context.daysSinceLitterReplaced !== null ||
    context.hoursSinceLastScoop !== null;

  if (!hasContextData) {
    return null;
  }

  return (
    <div ref={ref} className="event-context-data">
      <div className="event-context-data-grid">
        {context.wasteWeight !== null && (
          <div className="event-context-data-item">
            Existing waste: <strong>{context.wasteWeight}g</strong>
          </div>
        )}
        {context.litterRemaining !== null && (
          <div className="event-context-data-item">
            Litter:{' '}
            <strong>{(context.litterRemaining / 1000).toFixed(1)}kg</strong>
          </div>
        )}
        {context.daysSinceLitterReplaced !== null && (
          <div className="event-context-data-item">
            Litter age: <strong>{context.daysSinceLitterReplaced}d</strong>
          </div>
        )}
        {context.hoursSinceLastScoop !== null && (
          <div className="event-context-data-item">
            Last scoop: <strong>{context.hoursSinceLastScoop}h</strong>
          </div>
        )}
        {context.totalVisits !== null && (
          <div className="event-context-data-item">
            Visits since scoop: <strong>{context.totalVisits}</strong>
          </div>
        )}
      </div>
    </div>
  );
});

EventContextData.displayName = 'EventContextData';

const EventExpandedChart = React.forwardRef<
  HTMLDivElement,
  EventExpandedChartProps
>(
  (
    {
      data,
      borderColor = 'rgb(75, 192, 192)',
      backgroundColor = 'rgba(75, 192, 192, 0.2)',
    },
    ref,
  ) => {
    const chartData = {
      labels: data.timestamps.map((t) => (t / 1000).toFixed(1)),
      datasets: [
        {
          label: 'Weight (grams)',
          data: data.weights,
          borderColor,
          backgroundColor,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2,
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            title: (context: TooltipItem<'line'>[]) =>
              `Time: ${context[0].label}s`,
            label: (context: TooltipItem<'line'>) =>
              `Weight: ${context.parsed.y?.toFixed(1)}g`,
          },
        },
      },
      animation: { duration: 0 },
      scales: {
        x: {
          display: true,
          title: { display: true, text: 'Time (seconds)' },
          grid: { display: false },
        },
        y: {
          display: true,
          title: { display: true, text: 'Weight (grams)' },
          grid: { color: 'rgba(0, 0, 0, 0.1)' },
        },
      },
    };

    return (
      <div ref={ref} className="event-weight-chart-expanded">
        <Line data={chartData} options={options} />
      </div>
    );
  },
);

EventExpandedChart.displayName = 'EventExpandedChart';

export {
  EventChartButton,
  EventExpandedSection,
  EventContextData,
  EventExpandedChart,
};
export default EventChartButton;
