import * as React from "react";
import { ChartJS } from '../lib/chartHelpers';
import { detectPhasesWithEvents } from '../lib/phaseDetection';
import type { EventData, Features, DecodedData } from '../types';
import { cn } from "@/lib/utils";

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
  'empty': { bg: 'rgba(158, 158, 158, 0.1)', border: 'rgba(158, 158, 158, 0.3)' },
  'entering': { bg: 'rgba(25, 118, 210, 0.1)', border: 'rgba(25, 118, 210, 0.3)' },
  'occupied': { bg: 'rgba(76, 175, 80, 0.1)', border: 'rgba(76, 175, 80, 0.3)' },
  'hesitating': { bg: 'rgba(255, 152, 0, 0.1)', border: 'rgba(255, 152, 0, 0.3)' },
  'short_exit': { bg: 'rgba(156, 39, 176, 0.1)', border: 'rgba(156, 39, 176, 0.3)' },
  'exiting': { bg: 'rgba(244, 67, 54, 0.1)', border: 'rgba(244, 67, 54, 0.3)' },
  'ended': { bg: 'rgba(96, 125, 139, 0.1)', border: 'rgba(96, 125, 139, 0.3)' }
};

/**
 * Creates state region annotations for the chart based on the state timeline
 */
function createStateAnnotations(stateTimeline: Array<{ state: string }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stateAnnotations: Record<string, any> = {};
  
  // Group consecutive states into regions
  let currentState = '';
  let stateStart = 0;
  let annotationIndex = 0;
  
  for (let i = 0; i < stateTimeline.length; i++) {
    const state = stateTimeline[i].state;
    
    if (state !== currentState) {
      // End previous state region
      if (currentState && i > stateStart) {
        const color = STATE_COLORS[currentState] || STATE_COLORS['empty'];
        
        stateAnnotations[`state_${annotationIndex}`] = {
          type: 'box',
          xMin: (stateStart / 10).toFixed(1),
          xMax: ((i - 1) / 10).toFixed(1),
          backgroundColor: color.bg,
          borderColor: color.border,
          borderWidth: 1,
          label: {
            display: true,
            content: currentState.toUpperCase(),
            position: 'center',
            font: {
              size: 10
            },
            color: color.border
          }
        };
        annotationIndex++;
      }
      
      currentState = state;
      stateStart = i;
    }
  }
  
  // Handle the last state
  if (currentState && stateTimeline.length > stateStart) {
    const color = STATE_COLORS[currentState] || STATE_COLORS['empty'];
    
    stateAnnotations[`state_${annotationIndex}`] = {
      type: 'box',
      xMin: (stateStart / 10).toFixed(1),
      xMax: ((stateTimeline.length - 1) / 10).toFixed(1),
      backgroundColor: color.bg,
      borderColor: color.border,
      borderWidth: 1,
      label: {
        display: true,
        content: currentState.toUpperCase(),
        position: 'center',
        font: {
          size: 10
        },
        color: color.border
      }
    };
  }

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

      // Get state timeline for annotations
      const result = detectPhasesWithEvents(weights);
      const stateTimeline = result.stateTimeline;
      
      // Create annotations
      const stateAnnotations = createStateAnnotations(stateTimeline);
      const phaseAnnotations = createPhaseAnnotations(phases);

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
              pointHoverRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: `Weight Over Time - Event ${selectedEvent.id}`
            },
            legend: {
              display: true
            },
            annotation: {
              // @ts-expect-error - Chart.js annotation types are complex
              annotations: {
                ...stateAnnotations,
                ...phaseAnnotations
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
              display: true,
              title: {
                display: true,
                text: 'Weight (grams)'
              }
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
