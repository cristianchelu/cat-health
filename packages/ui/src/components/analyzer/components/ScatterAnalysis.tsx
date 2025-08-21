import * as React from "react";
import { useState, useEffect } from 'react';
import type { ProcessedEventData, EventData } from '../types';
import { featureDimensions, getFeatureValue } from '../lib/featureExtraction';
import { getEliminationColor } from '../lib/utils';
import { ChartJS } from '../lib/chartHelpers';
import { Card } from "@/components/ui/Card";

import './ScatterAnalysis.css'

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
    const [xMin, setXMin] = useState<number | undefined>(undefined);
    const [xMax, setXMax] = useState<number | undefined>(undefined);
    const [yMin, setYMin] = useState<number | undefined>(undefined);
    const [yMax, setYMax] = useState<number | undefined>(undefined);

    // Helper function to calculate data bounds for the current axes
    const calculateAxisBounds = () => {
      if (scatterData.length === 0) return { xBounds: [0, 1], yBounds: [0, 1] };
      
      const allXValues = scatterData.map(d => getFeatureValue(d.features, scatterXAxis));
      const allYValues = scatterData.map(d => getFeatureValue(d.features, scatterYAxis));
      
      const xBounds = [Math.min(...allXValues), Math.max(...allXValues)];
      const yBounds = [Math.min(...allYValues), Math.max(...allYValues)];
      
      return { xBounds, yBounds };
    };

    // Calculate bounds for the current data
    const { xBounds, yBounds } = calculateAxisBounds();

    // Filter data based on user-defined bounds
    const filteredScatterData = scatterData.filter(d => {
      const xValue = getFeatureValue(d.features, scatterXAxis);
      const yValue = getFeatureValue(d.features, scatterYAxis);
      
      const xInRange = (xMin === undefined || xValue >= xMin) && (xMax === undefined || xValue <= xMax);
      const yInRange = (yMin === undefined || yValue >= yMin) && (yMax === undefined || yValue <= yMax);
      
      return xInRange && yInRange;
    });

    // Effect for creating/updating the scatter chart
    useEffect(() => {
      // Destroy existing scatter chart when axes change
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }

      const createChart = () => {
        if (!chartRef.current || filteredScatterData.length === 0) return;
        
        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        // Group data by elimination type
        const datasets = ['urination', 'both', 'defecation', 'unknown'].map(type => {
          const typeData = filteredScatterData.filter(d => d.eliminationType === type);
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
        
        const xMinCalc = allXValues.length > 0 ? Math.min(...allXValues) : 0;
        const xMaxCalc = allXValues.length > 0 ? Math.max(...allXValues) : 1;
        const yMinCalc = allYValues.length > 0 ? Math.min(...allYValues) : 0;
        const yMaxCalc = allYValues.length > 0 ? Math.max(...allYValues) : 1;
        
        // Add 10% padding to each side
        const xPadding = (xMaxCalc - xMinCalc) * 0.1;
        const yPadding = (yMaxCalc - yMinCalc) * 0.1;
        
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
                min: Math.max(0, xMinCalc - xPadding), // Don't go below 0 for most features
                max: xMaxCalc + xPadding,
                title: {
                  display: true,
                  text: `${xDimension?.label || 'X'} ${xDimension?.unit ? `(${xDimension.unit})` : ''}`
                }
              },
              y: {
                type: 'linear',
                min: Math.max(0, yMinCalc - yPadding), // Don't go below 0 for most features
                max: yMaxCalc + yPadding,
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
                const eventToSelect = filteredScatterData.find(d => d.event.id === eventId)?.event;
                if (eventToSelect) {
                  onEventSelect(eventToSelect);
                }
              }
            }
          }
        });
      };

      createChart();
    }, [scatterXAxis, scatterYAxis, scatterData, filteredScatterData, onEventSelect, chartRef, chartInstance, xMin, xMax, yMin, yMax]);

    return (
      <Card className="scatter-analysis" ref={ref}>
        <h2>🔍 Event Correlation Analysis</h2>
        
        {/* Axis Selection Controls */}
        <div className="scatter-controls">
          <div className="axis-controls">
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
            <div className="range-controls">
              <div className="range-input">
                <label htmlFor="x-min">Min:</label>
                <input
                  id="x-min"
                  type="number"
                  step="0.01"
                  value={xMin ?? ''}
                  onChange={(e) => setXMin(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                  placeholder={`${xBounds[0].toFixed(2)}`}
                />
              </div>
              <div className="range-input">
                <label htmlFor="x-max">Max:</label>
                <input
                  id="x-max"
                  type="number"
                  step="0.01"
                  value={xMax ?? ''}
                  onChange={(e) => setXMax(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                  placeholder={`${xBounds[1].toFixed(2)}`}
                />
              </div>
            </div>
          </div>
          
          <div className="axis-controls">
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
            <div className="range-controls">
              <div className="range-input">
                <label htmlFor="y-min">Min:</label>
                <input
                  id="y-min"
                  type="number"
                  step="0.01"
                  value={yMin ?? ''}
                  onChange={(e) => setYMin(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                  placeholder={`${yBounds[0].toFixed(2)}`}
                />
              </div>
              <div className="range-input">
                <label htmlFor="y-max">Max:</label>
                <input
                  id="y-max"
                  type="number"
                  step="0.01"
                  value={yMax ?? ''}
                  onChange={(e) => setYMax(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                  placeholder={`${yBounds[1].toFixed(2)}`}
                />
              </div>
            </div>
          </div>
          
          {/* Reset Filters Button */}
          {(xMin !== undefined || xMax !== undefined || yMin !== undefined || yMax !== undefined) && (
            <button
              className="reset-filters-btn"
              onClick={() => {
                setXMin(undefined);
                setXMax(undefined);
                setYMin(undefined);
                setYMax(undefined);
              }}
              title="Reset all filters"
            >
              🔄 Reset Filters
            </button>
          )}
        </div>

        {/* Chart Container */}
        <div className="chart-container">
          <canvas ref={chartRef} />
        </div>

        {/* Data Summary */}
        <div className="scatter-summary">
          <div className="summary-stats">
            <span className="stat">Filtered Events: <strong>{filteredScatterData.length}</strong></span>
            <span className="stat">Total Events: <strong>{scatterData.length}</strong></span>
            <span className="stat">Urination: <strong>{filteredScatterData.filter(d => d.eliminationType === 'urination').length}</strong></span>
            <span className="stat">Both: <strong>{filteredScatterData.filter(d => d.eliminationType === 'both').length}</strong></span>
            <span className="stat">Defecation: <strong>{filteredScatterData.filter(d => d.eliminationType === 'defecation').length}</strong></span>
            <span className="stat">Unknown: <strong>{filteredScatterData.filter(d => d.eliminationType === 'unknown').length}</strong></span>
          </div>
          <p className="chart-hint">💡 Click on any point to analyze that specific event</p>
          {filteredScatterData.length < scatterData.length && (
            <p className="filter-notice">⚠️ {scatterData.length - filteredScatterData.length} events filtered out</p>
          )}
        </div>
      </Card>
    );
  }
);

ScatterAnalysis.displayName = "ScatterAnalysis";

export { type ScatterAnalysisProps };
export default ScatterAnalysis;
