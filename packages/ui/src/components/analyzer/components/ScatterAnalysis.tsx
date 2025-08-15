import * as React from "react";
import { useState, useEffect } from 'react';
import type { ProcessedEventData, EventData } from '../types';
import { featureDimensions, getFeatureValue } from '../lib/featureExtraction';
import { getEliminationColor } from '../lib/utils';
import { ChartJS } from '../lib/chartHelpers';

interface ScatterAnalysisProps {
  scatterData: ProcessedEventData[];
  onEventSelect: (event: EventData) => void;
  chartRef: React.RefObject<HTMLCanvasElement | null>;
  chartInstance: React.MutableRefObject<ChartJS | null>;
}

const ScatterAnalysis = React.forwardRef<HTMLDivElement, ScatterAnalysisProps>(
  ({ scatterData, onEventSelect, chartRef, chartInstance }, ref) => {
    const [scatterXAxis, setScatterXAxis] = useState<string>('eliminationDuration');
    const [scatterYAxis, setScatterYAxis] = useState<string>('wasteWeight');

    // Effect for creating/updating the scatter chart
    useEffect(() => {
      // Destroy existing scatter chart when axes change
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }

      const createChart = () => {
        if (!chartRef.current || scatterData.length === 0) return;
        
        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        // Group data by elimination type
        const datasets = ['urination', 'defecation', 'unknown'].map(type => {
          const typeData = scatterData.filter(d => d.eliminationType === type);
          const color = getEliminationColor(type);
          
          return {
            label: type.charAt(0).toUpperCase() + type.slice(1),
            data: typeData.map(d => ({
              x: getFeatureValue(d.features, scatterXAxis),
              y: getFeatureValue(d.features, scatterYAxis),
              eventId: d.event.id
            })),
            backgroundColor: color.bg,
            borderColor: color.border,
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
          };
        }).filter(dataset => dataset.data.length > 0);

        // Calculate axis bounds with padding
        const allXValues = datasets.flatMap(d => d.data.map(p => p.x));
        const allYValues = datasets.flatMap(d => d.data.map(p => p.y));
        
        const xMin = Math.min(...allXValues);
        const xMax = Math.max(...allXValues);
        const yMin = Math.min(...allYValues);
        const yMax = Math.max(...allYValues);
        
        // Add 10% padding to each side
        const xPadding = (xMax - xMin) * 0.1;
        const yPadding = (yMax - yMin) * 0.1;
        
        const xDimension = featureDimensions.find(d => d.key === scatterXAxis);
        const yDimension = featureDimensions.find(d => d.key === scatterYAxis);

        chartInstance.current = new ChartJS(ctx, {
          type: 'scatter',
          data: { datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 0 // Disable animations to prevent jittering
            },
            plugins: {
              title: {
                display: true,
                text: `Event Correlation Analysis: ${yDimension?.label || 'Y'} vs ${xDimension?.label || 'X'}`
              },
              legend: {
                display: true,
                position: 'top'
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const point = context.parsed;
                    const eventId = (context.raw as { eventId: number }).eventId;
                    const event = scatterData.find(d => d.event.id === eventId);
                    const timestamp = event ? new Date(event.event.timestamp).toLocaleString() : 'Unknown';
                    return [
                      `${context.dataset.label}`,
                      `${xDimension?.label}: ${point.x.toFixed(2)}${xDimension?.unit}`,
                      `${yDimension?.label}: ${point.y.toFixed(2)}${yDimension?.unit}`,
                      `Time: ${timestamp}`
                    ];
                  }
                }
              }
            },
            scales: {
              x: {
                type: 'linear',
                min: Math.max(0, xMin - xPadding), // Don't go below 0 for most features
                max: xMax + xPadding,
                title: {
                  display: true,
                  text: `${xDimension?.label || 'X'} ${xDimension?.unit ? `(${xDimension.unit})` : ''}`
                }
              },
              y: {
                type: 'linear',
                min: Math.max(0, yMin - yPadding), // Don't go below 0 for most features
                max: yMax + yPadding,
                title: {
                  display: true,
                  text: `${yDimension?.label || 'Y'} ${yDimension?.unit ? `(${yDimension.unit})` : ''}`
                }
              }
            },
            onClick: (_, elements) => {
              if (elements.length > 0) {
                const element = elements[0];
                const datasetIndex = element.datasetIndex;
                const index = element.index;
                const dataset = datasets[datasetIndex];
                const eventId = (dataset.data[index] as { eventId: number }).eventId;
                const eventToSelect = scatterData.find(d => d.event.id === eventId)?.event;
                if (eventToSelect) {
                  onEventSelect(eventToSelect);
                }
              }
            }
          }
        });
      };

      createChart();
    }, [scatterXAxis, scatterYAxis, scatterData, onEventSelect, chartRef, chartInstance]);

    return (
      <div className="scatter-analysis" ref={ref}>
        <h2>🔍 Event Correlation Analysis</h2>
        
        {/* Axis Selection Controls */}
        <div className="scatter-controls">
          <div className="axis-selector">
            <label htmlFor="x-axis-select">X-Axis:</label>
            <select 
              id="x-axis-select"
              value={scatterXAxis} 
              onChange={(e) => setScatterXAxis(e.target.value)}
            >
              {featureDimensions.map(dim => (
                <option key={dim.key} value={dim.key}>
                  {dim.label}
                </option>
              ))}
            </select>
          </div>
          <div className="axis-selector">
            <label htmlFor="y-axis-select">Y-Axis:</label>
            <select 
              id="y-axis-select"
              value={scatterYAxis} 
              onChange={(e) => setScatterYAxis(e.target.value)}
            >
              {featureDimensions.map(dim => (
                <option key={dim.key} value={dim.key}>
                  {dim.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Chart Container */}
        <div className="chart-container">
          <canvas ref={chartRef} />
        </div>

        {/* Data Summary */}
        <div className="scatter-summary">
          <div className="summary-stats">
            <span className="stat">Total Events: <strong>{scatterData.length}</strong></span>
            <span className="stat">Urination: <strong>{scatterData.filter(d => d.eliminationType === 'urination').length}</strong></span>
            <span className="stat">Defecation: <strong>{scatterData.filter(d => d.eliminationType === 'defecation').length}</strong></span>
            <span className="stat">Unknown: <strong>{scatterData.filter(d => d.eliminationType === 'unknown').length}</strong></span>
          </div>
          <p className="chart-hint">💡 Click on any point to analyze that specific event</p>
        </div>
      </div>
    );
  }
);

ScatterAnalysis.displayName = "ScatterAnalysis";

export { type ScatterAnalysisProps };
export default ScatterAnalysis;
