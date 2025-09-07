import * as React from "react";
import { ChartJS } from '../lib/chartHelpers';
import { detectPhasesWithEvents } from '../lib/phaseDetection';
import type { EventData, Features, DecodedData } from '../types';
import { cn } from "@/lib/utils";

// Helper function to calculate rolling variance (imported from phaseDetection logic)
const calculateRollingVariance = (weights: number[], windowSize: number = 10): number[] => {
  const variances: number[] = [];
  
  for (let i = 0; i < weights.length; i++) {
    // Post processing, center window
    // const start = Math.max(0, i - Math.floor(windowSize / 2));
    // const end = Math.min(weights.length, i + Math.floor(windowSize / 2) + 1);
    // const window = weights.slice(start, end);

    // Real time processing, no knowledge of future, window is past values only
    const start = Math.max(0, i - windowSize + 1);
    const end = i + 1;
    const window = weights.slice(start, end);
    
    if (window.length < 2) {
      variances.push(0);
      continue;
    }
    
    const mean = window.reduce((sum, w) => sum + w, 0) / window.length;
    const variance = window.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / window.length;
    variances.push(Math.min(variance, 500000));
    // variances.push(variance)
  }
  
  return variances;
};

import "./WeightChart.css";

interface WeightChartProps {
  selectedEvent: EventData;
  analysisData: {
    decodedData: DecodedData;
    features: Features;
  };
  className?: string;
}

// State color configuration
const STATE_COLORS: Record<string, { bg: string; border: string }> = {
  // 'empty': { bg: 'rgba(158, 158, 158, 0.1)', border: 'rgba(158, 158, 158, 0.3)' },
  // 'entering': { bg: 'rgba(25, 118, 210, 0.1)', border: 'rgba(25, 118, 210, 0.3)' },
  // 'occupied': { bg: 'rgba(76, 175, 80, 0.1)', border: 'rgba(76, 175, 80, 0.3)' },
  // 'hesitating': { bg: 'rgba(255, 152, 0, 0.1)', border: 'rgba(255, 152, 0, 0.3)' },
  // 'short_exit': { bg: 'rgba(156, 39, 176, 0.1)', border: 'rgba(156, 39, 176, 0.3)' },
  // 'exiting': { bg: 'rgba(244, 67, 54, 0.1)', border: 'rgba(244, 67, 54, 0.3)' },
  // 'ended': { bg: 'rgba(96, 125, 139, 0.1)', border: 'rgba(96, 125, 139, 0.3)' }
  'empty': { bg: 'rgba(158, 158, 158, 0.1)', border: 'rgba(158, 158, 158, 0.5)' },
  'entering': { bg: 'rgba(25, 118, 210, 0.1)', border: 'rgba(25, 118, 210, 0.5)' },
  'occupied': { bg: 'rgba(76, 175, 80, 0.1)', border: 'rgba(76, 175, 80, 0.5)' },
  'eliminating': { bg: 'rgba(255, 152, 0, 0.1)', border: 'rgba(255, 152, 0, 0.5)' },
  'gap': { bg: 'rgba(156, 39, 176, 0.1)', border: 'rgba(156, 39, 176, 0.5)' },
  // 'exiting': { bg: 'rgba(244, 67, 54, 0.1)', border: 'rgba(244, 67, 54, 0.5)' },
  'ended': { bg: 'rgba(96, 125, 139, 0.1)', border: 'rgba(96, 125, 139, 0.5)' }
};

/**
 * Creates state region annotations for the chart based on post-processed state periods
 * @param statePeriods Array of { state, start, end } from LitterboxStateTracker.postProcessTransitions()
 */
function createStateAnnotations(statePeriods: Array<{ state: string; start: number; end: number }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stateAnnotations: Record<string, any> = {};
  statePeriods.forEach((period, idx) => {
    const color = STATE_COLORS[period.state] || STATE_COLORS['empty'];
    stateAnnotations[`state_${idx}`] = {
      type: 'box',
      xMin: (period.start / 10).toFixed(1),
      xMax: (period.end / 10).toFixed(1),
      backgroundColor: color.bg,
      borderColor: color.border,
      borderWidth: 1,
      label: {
        display: true,
        content: period.state.toUpperCase(),
        position: 'center',
        font: {
          size: 10
        },
        color: color.border
      }
    };
  });
  return stateAnnotations;
}

/**
 * Creates phase marker annotations for the chart
 */
function createPhaseAnnotations(phases: Features['phases']) {
  return {
    stepIn: {
      type: 'line',
      xMin: (phases.stepIn / 10).toFixed(1),
      xMax: (phases.stepIn / 10).toFixed(1),
      borderColor: 'blue',
      borderWidth: 2,
      label: {
        display: true,
        content: 'Step In',
        position: 'start'
      }
    },
    eliminationStart: {
      type: 'line',
      xMin: (phases.eliminationStart / 10).toFixed(1),
      xMax: (phases.eliminationStart / 10).toFixed(1),
      borderColor: 'orange',
      borderWidth: 2,
      label: {
        display: true,
        content: 'Elimination Start',
        position: 'start'
      }
    },
    eliminationEnd: {
      type: 'line',
      xMin: (phases.eliminationEnd / 10).toFixed(1),
      xMax: (phases.eliminationEnd / 10).toFixed(1),
      borderColor: 'red',
      borderWidth: 2,
      label: {
        display: true,
        content: 'Elimination End',
        position: 'start'
      }
    },
    stepOut: {
      type: 'line',
      xMin: (phases.stepOut / 10).toFixed(1),
      xMax: (phases.stepOut / 10).toFixed(1),
      borderColor: 'purple',
      borderWidth: 2,
      label: {
        display: true,
        content: 'Step Out',
        position: 'start'
      }
    }
  };
}

const WeightChart = React.forwardRef<HTMLCanvasElement, WeightChartProps>(
  ({ selectedEvent, analysisData, className }, ref) => {
    const chartInstanceRef = React.useRef<InstanceType<typeof ChartJS> | null>(null);

    React.useEffect(() => {
      if (!analysisData || !selectedEvent || !ref || typeof ref === 'function') return;
      
      const canvas = ref.current;
      if (!canvas) return;

      // Clean up existing chart
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const data = analysisData.decodedData;
      const features = analysisData.features;
      const timeLabels = data.measurements.map((_, i) => (i / 10).toFixed(1));
      const weights = data.measurements.map((m: { weight: number }) => m.weight);
      const phases = features.phases;

      // Calculate rolling variance
      const rollingVariance = calculateRollingVariance(weights);

      // Get state timeline and post-processed state periods for annotations
      const result = detectPhasesWithEvents(weights);
      // Use post-processed state periods for annotation regions
      const statePeriods = result.finalStatePeriods || [];
      const stateAnnotations = createStateAnnotations(statePeriods);

      chartInstanceRef.current = new ChartJS(ctx, {
        type: 'line',
        data: {
          labels: timeLabels,
          datasets: [
            {
              label: 'Weight (g)',
              data: weights,
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              tension: 0.1,
              pointRadius: 1,
              pointHoverRadius: 4,
              yAxisID: 'y'
            },
            {
              label: 'Rolling Variance',
              data: rollingVariance,
              borderColor: 'rgb(255, 99, 132)',
              backgroundColor: 'rgba(255, 99, 132, 0.1)',
              tension: 0.1,
              pointRadius: 0,
              pointHoverRadius: 3,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            title: {
              display: true,
              text: `Weight & Variance Over Time - Event ${selectedEvent.id}`
            },
            legend: {
              display: true
            },
            annotation: {
              // // @ts-expect-error - Chart.js annotation types are complex
              annotations: {
                ...stateAnnotations,
                // ...phaseAnnotations
              }
            }
          },
          scales: {
            x: {
              display: true,
              title: {
                display: true,
                text: 'Time (seconds)'
              }
            },
            y: {
              type: 'linear',
              display: true,
              position: 'left',
              title: {
                display: true,
                text: 'Weight (grams)'
              }
            },
            y1: {
              type: 'linear',
              display: true,
              position: 'right',
              title: {
                display: true,
                text: 'Rolling Variance'
              },
              grid: {
                drawOnChartArea: false,
              },
            }
          }
        }
      });
    }, [analysisData, selectedEvent, ref]);

    // Cleanup on unmount
    React.useEffect(() => {
      return () => {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.destroy();
          chartInstanceRef.current = null;
        }
      };
    }, []);

    return (
      <div className={cn("weight-chart", className)}>
        <canvas ref={ref} />
      </div>
    );
  }
);

WeightChart.displayName = "WeightChart";

export { type WeightChartProps };
export default WeightChart;
