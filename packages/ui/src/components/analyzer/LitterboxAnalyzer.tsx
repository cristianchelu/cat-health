import * as React from "react";
import { useState, useRef, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import './LitterboxAnalyzer.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  annotationPlugin
);

interface EventData {
  id: number;
  timestamp: string;
  data: Record<string, unknown>;
  raw_data?: number[] | null;
  human_verified: boolean;
}

// Helper to safely get event data properties
const getEventDataProp = (data: Record<string, unknown>, key: string): unknown => {
  return data[key];
};

// Binary data decoder
const decodeRawData = (rawDataArray: number[]): DecodedData => {
  if (!rawDataArray || rawDataArray.length === 0) {
    throw new Error('No raw data available');
  }
  
  const uint8Array = new Uint8Array(rawDataArray);
  const buffer = uint8Array.buffer;
  const dataView = new DataView(buffer);
  let offset = 0;
  
  const version = dataView.getUint8(offset);
  offset += 1;
  
  if (version !== 1) {
    throw new Error(`Unsupported version: ${version}`);
  }
  
  const startTimestamp = Number(dataView.getBigUint64(offset, false));
  offset += 8;
  
  const context: DecodedData['context'] = {};
  const wasteWeight = dataView.getUint16(offset, false);
  context.wasteWeight = wasteWeight === 65535 ? undefined : wasteWeight;
  offset += 2;
  
  const litterRemaining = dataView.getUint16(offset, false);
  context.litterRemaining = litterRemaining === 65535 ? undefined : litterRemaining;
  offset += 2;
  
  const deepCleanTimer = dataView.getUint8(offset);
  context.deepCleanTimer = deepCleanTimer === 255 ? undefined : deepCleanTimer;
  offset += 1;
  
  const totalVisits = dataView.getUint8(offset);
  context.totalVisits = totalVisits === 255 ? undefined : totalVisits;
  offset += 1;
  
  const daysSinceLitterReplaced = dataView.getUint8(offset);
  context.daysSinceLitterReplaced = daysSinceLitterReplaced === 255 ? undefined : daysSinceLitterReplaced;
  offset += 1;
  
  const hoursSinceLastScoop = dataView.getUint8(offset);
  context.hoursSinceLastScoop = hoursSinceLastScoop === 255 ? undefined : hoursSinceLastScoop;
  offset += 1;
  
  offset += 2; // Skip reserved
  
  const count = dataView.getUint32(offset, false);
  offset += 4;
  
  const measurements = [];
  for (let i = 0; i < count; i++) {
    const weight = dataView.getInt16(offset, false);
    measurements.push({ weight });
    offset += 2;
  }
  
  return {
    startTime: new Date(startTimestamp),
    measurements,
    context
  };
};

// Phase detection
const detectPhases = (weights: number[]): PhaseData => {
  const n = weights.length;
  
  // Find baseline from the end when cat has left
  const lastTenth = weights.slice(Math.floor(9*n/10));
  const baselineWeight = Math.min(...lastTenth);
  
  // Find step in when weight STABILIZES
  let stepInIndex = 0;
  
  // Find the cat weight by looking for stable maximum
  let catWeight = 0;
  const windowSize = 20; // 2 seconds at 10Hz
  
  // Look for stable weight in first half of data
  for (let i = windowSize; i < Math.floor(n/2); i++) {
    const window = weights.slice(i - windowSize, i);
    const mean = window.reduce((s, w) => s + w, 0) / window.length;
    const variance = window.reduce((s, w) => s + Math.pow(w - mean, 2), 0) / window.length;
    
    // If variance is low (stable) and weight is high (cat present)
    if (variance < 10000 && mean > baselineWeight + 2000) {
      catWeight = Math.max(catWeight, mean);
    }
  }
  
  // Find when weight first stabilizes near cat weight
  const stabilizationThreshold = catWeight * 0.9;
  const varianceThreshold = 50000;
  
  for (let i = 10; i < Math.floor(n/3); i++) {
    if (i + windowSize >= n) break;
    
    const window = weights.slice(i, i + windowSize);
    const mean = window.reduce((s, w) => s + w, 0) / window.length;
    const variance = window.reduce((s, w) => s + Math.pow(w - mean, 2), 0) / window.length;
    
    if (mean > stabilizationThreshold && variance < varianceThreshold) {
      stepInIndex = i;
      break;
    }
  }
  
  // Fallback if no stabilization found
  if (stepInIndex === 0) {
    const fallbackThreshold = baselineWeight + (catWeight - baselineWeight) * 0.5;
    for (let i = 1; i < Math.floor(n/4); i++) {
      if (weights[i] > fallbackThreshold) {
        stepInIndex = i;
        break;
      }
    }
  }
  
  // Find step out
  let stepOutIndex = n - 1;
  const dropThreshold = catWeight * 0.85;
  
  for (let i = Math.floor(2*n/3); i < n - 10; i++) {
    if (weights[i] < dropThreshold) {
      stepOutIndex = i;
      break;
    }
  }
  
  // Detect elimination period
  const searchStart = stepInIndex;
  const searchEnd = stepOutIndex;
  const vibrationThreshold = 30;
  let eliminationStart = -1;
  let eliminationEnd = -1;
  let inStable = false;
  let stableStart = -1;
  let maxStable = 0;
  let maxStableStart = -1;
  let maxStableEnd = -1;
  
  for (let i = searchStart; i < searchEnd - 4; i++) {
    const prevWindow = weights.slice(i - 6, i);
    const sortedPrev = prevWindow.slice().sort((a, b) => a - b);
    const q90Prev = sortedPrev[Math.floor(0.9 * (sortedPrev.length - 1))];
    const delta = Math.abs(weights[i] - q90Prev);
    
    if (delta < vibrationThreshold) {
      if (!inStable) {
        inStable = true;
        stableStart = i;
      }
    } else {
      if (inStable) {
        const stableLen = i - stableStart;
        if (stableLen > maxStable) {
          maxStable = stableLen;
          maxStableStart = stableStart;
          maxStableEnd = i;
        }
        inStable = false;
      }
    }
  }
  
  if (inStable) {
    const stableLen = searchEnd - stableStart;
    if (stableLen > maxStable) {
      maxStable = stableLen;
      maxStableStart = stableStart;
      maxStableEnd = searchEnd;
    }
  }
  
  if (maxStable > 0) {
    eliminationStart = maxStableStart;
    eliminationEnd = maxStableEnd;
  } else {
    eliminationStart = searchStart;
    eliminationEnd = searchStart + 5;
  }

  return {
    entry: 0,
    stepIn: stepInIndex,
    eliminationStart: eliminationStart,
    eliminationEnd: eliminationEnd,
    stepOut: stepOutIndex,
    exit: n - 1
  };
};

// Helper functions for feature extraction
const calculateFilteredVariance = (signal: number[], outlierPercentile = 95): number => {
  if (signal.length === 0) return 0;
  
  const mean = signal.reduce((s, w) => s + w, 0) / signal.length;
  const deviations = signal.map(w => Math.abs(w - mean));
  const sortedDeviations = [...deviations].sort((a, b) => a - b);
  const percentileIndex = Math.floor(sortedDeviations.length * outlierPercentile / 100);
  const outlierThreshold = sortedDeviations[Math.min(percentileIndex, sortedDeviations.length - 1)];
  
  const filteredSignal = signal.filter((_, i) => deviations[i] <= outlierThreshold);
  
  if (filteredSignal.length === 0) return 0;
  
  const filteredMean = filteredSignal.reduce((s, w) => s + w, 0) / filteredSignal.length;
  const variance = filteredSignal.reduce((s, w) => s + Math.pow(w - filteredMean, 2), 0) / filteredSignal.length;
  
  return variance;
};

const calculateSpectralEntropy = (signal: number[]): number => {
  if (signal.length < 8) return 0;
  
  const windowSize = Math.min(8, Math.floor(signal.length / 4));
  const powers = [];
  
  for (let i = 0; i <= signal.length - windowSize; i++) {
    const window = signal.slice(i, i + windowSize);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const variance = window.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / window.length;
    powers.push(Math.max(variance, 0.001));
  }
  
  const totalPower = powers.reduce((s, p) => s + p, 0);
  if (totalPower === 0) return 0;
  
  const entropy = powers.reduce((entropy, power) => {
    const p = power / totalPower;
    return entropy - p * Math.log2(p);
  }, 0);
  
  return entropy;
};

const countPeaks = (signal: number[], prominence = 20): number => {
  if (signal.length < 3) return 0;
  
  let peaks = 0;
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i-1] && signal[i] > signal[i+1]) {
      const leftMin = Math.min(...signal.slice(Math.max(0, i-5), i));
      const rightMin = Math.min(...signal.slice(i+1, Math.min(signal.length, i+6)));
      if (signal[i] - Math.max(leftMin, rightMin) > prominence) {
        peaks++;
      }
    }
  }
  return peaks;
};

// Calculate features
const extractFeatures = (weights: number[], sampleRate = 10): Features => {
  const phases = detectPhases(weights);
  const timeStep = 1 / sampleRate;
  
  const features: Features = {
    preEliminationDuration: (phases.eliminationStart - phases.stepIn) * timeStep,
    eliminationDuration: (phases.eliminationEnd - phases.eliminationStart) * timeStep,
    coveringDuration: (phases.stepOut - phases.eliminationEnd) * timeStep,
    totalDuration: (phases.stepOut - phases.stepIn) * timeStep,
    
    wasteWeight: weights[weights.length - 1],
    maxWeight: Math.max(...weights),
    initialWeight: weights[0],
    finalWeight: weights[weights.length - 1],
    
    coveringVariance: 0,
    coveringFluctuations: 0,
    coveringSpectralEntropy: 0,
    preEliminationVariance: 0,
    eliminationRate: 0,
    
    phases
  };
  
  features.eliminationRate = features.eliminationDuration > 0 ? 
    features.wasteWeight / features.eliminationDuration : 0;
  
  // Calculate covering variance with outlier filtering
  if (phases.eliminationEnd < phases.stepOut) {
    const coveringSignal = weights.slice(phases.eliminationEnd, phases.stepOut);
    if (coveringSignal.length > 0) {
      features.coveringVariance = calculateFilteredVariance(coveringSignal);
      features.coveringFluctuations = countPeaks(coveringSignal);
      features.coveringSpectralEntropy = calculateSpectralEntropy(coveringSignal);
    }
  }
  
  // Calculate pre-elimination variance
  if (phases.eliminationStart > phases.stepIn) {
    const preSignal = weights.slice(phases.stepIn, phases.eliminationStart);
    if (preSignal.length > 0) {
      features.preEliminationVariance = calculateFilteredVariance(preSignal);
    }
  }
  
  return features;
};

interface DecodedData {
  startTime: Date;
  measurements: { weight: number }[];
  context: {
    wasteWeight?: number;
    litterRemaining?: number;
    deepCleanTimer?: number;
    totalVisits?: number;
    daysSinceLitterReplaced?: number;
    hoursSinceLastScoop?: number;
  };
}

interface PhaseData {
  entry: number;
  stepIn: number;
  eliminationStart: number;
  eliminationEnd: number;
  stepOut: number;
  exit: number;
}

interface Features {
  preEliminationDuration: number;
  eliminationDuration: number;
  coveringDuration: number;
  totalDuration: number;
  wasteWeight: number;
  maxWeight: number;
  initialWeight: number;
  finalWeight: number;
  coveringVariance: number;
  coveringFluctuations: number;
  coveringSpectralEntropy: number;
  preEliminationVariance: number;
  eliminationRate: number;
  phases: PhaseData;
}

interface LitterboxAnalyzerProps {
  events: EventData[];
  className?: string;
}

const LitterboxAnalyzer = React.forwardRef<HTMLDivElement, LitterboxAnalyzerProps>(
  ({ events, className }, ref) => {
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [analysisData, setAnalysisData] = useState<{
    decodedData: DecodedData;
    features: Features;
  } | null>(null);
  const [error, setError] = useState<string>('');
  
  // Chart refs
  const weightChartRef = useRef<HTMLCanvasElement>(null);
  const analysisChartRef = useRef<HTMLCanvasElement>(null);
  const weightChartInstance = useRef<ChartJS | null>(null);
  const analysisChartInstance = useRef<ChartJS | null>(null);

  // Cleanup on unmount and when switching tabs
  useEffect(() => {
    return () => {
      if (weightChartInstance.current) {
        weightChartInstance.current.destroy();
        weightChartInstance.current = null;
      }
      if (analysisChartInstance.current) {
        analysisChartInstance.current.destroy();
        analysisChartInstance.current = null;
      }
    };
  }, []);

  // Function to destroy existing charts
  const destroyCharts = () => {
    if (weightChartInstance.current) {
      weightChartInstance.current.destroy();
      weightChartInstance.current = null;
    }
    if (analysisChartInstance.current) {
      analysisChartInstance.current.destroy();
      analysisChartInstance.current = null;
    }
  };

  // Function to create weight chart
  const createWeightChart = (data: DecodedData, features: Features) => {
    if (!weightChartRef.current) return;
    
    destroyCharts(); // Ensure clean slate
    
    const ctx = weightChartRef.current.getContext('2d');
    if (!ctx) return;

    const timeLabels = data.measurements.map((_, i) => (i / 10).toFixed(1));
    const weights = data.measurements.map(m => m.weight);
    const phases = features.phases;
    const eliminationType = String(getEventDataProp(selectedEvent?.data || {}, 'elimination_type') || 'unknown');

    weightChartInstance.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels: timeLabels,
        datasets: [
          {
            label: 'Weight (g)',
            data: weights,
            borderColor: eliminationType === 'defecation' ? '#d32f2f' : '#007AFF',
            backgroundColor: eliminationType === 'defecation' ? 'rgba(211, 47, 47, 0.1)' : 'rgba(0, 122, 255, 0.1)',
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 4,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `Weight Over Time - ${String(getEventDataProp(selectedEvent?.data || {}, 'elimination_type') || 'Unknown')} Event`
          },
          annotation: {
            annotations: {
              stepIn: {
                type: 'line',
                xMin: (phases.stepIn / 10).toFixed(1),
                xMax: (phases.stepIn / 10).toFixed(1),
                borderColor: '#1976d2',
                borderWidth: 2,
                label: {
                  content: 'Step In',
                  display: true,
                  position: '75%'
                }
              },
              eliminationStart: {
                type: 'line',
                xMin: (phases.eliminationStart / 10).toFixed(1),
                xMax: (phases.eliminationStart / 10).toFixed(1),
                borderColor: '#f57c00',
                borderWidth: 2,
                label: {
                  content: 'Elimination Start',
                  display: true,
                  position: '35%'
                }
              },
              eliminationEnd: {
                type: 'line',
                xMin: (phases.eliminationEnd / 10).toFixed(1),
                xMax: (phases.eliminationEnd / 10).toFixed(1),
                borderColor: '#7b1fa2',
                borderWidth: 2,
                label: {
                  content: 'Elimination End',
                  display: true,
                  position: '55%'
                }
              },
              stepOut: {
                type: 'line',
                xMin: (phases.stepOut / 10).toFixed(1),
                xMax: (phases.stepOut / 10).toFixed(1),
                borderColor: '#388e3c',
                borderWidth: 2,
                label: {
                  content: 'Step Out',
                  display: true,
                  position: '75%'
                }
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time (seconds)'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Weight (g)'
            }
          }
        }
      }
    });
  };

  // Function to create analysis chart
  const createAnalysisChart = (features: Features) => {
    if (!analysisChartRef.current) return;
    
    const ctx = analysisChartRef.current.getContext('2d');
    if (!ctx) return;

    analysisChartInstance.current = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels: ['Pre-elimination\n(seconds)', 'Elimination\n(seconds)', 'Covering\n(seconds)', 'Covering\nVariance', 'Waste\nWeight (g)'],
        datasets: [{
          label: 'Feature Values',
          data: [
            features.preEliminationDuration,
            features.eliminationDuration,
            features.coveringDuration,
            features.coveringVariance / 100, // Scale down for visualization
            features.wasteWeight
          ],
          backgroundColor: [
            'rgba(25, 118, 210, 0.7)',
            'rgba(245, 124, 0, 0.7)',
            'rgba(123, 31, 162, 0.7)',
            'rgba(255, 87, 34, 0.7)',
            'rgba(211, 47, 47, 0.7)'
          ],
          borderColor: [
            'rgb(25, 118, 210)',
            'rgb(245, 124, 0)',
            'rgb(123, 31, 162)',
            'rgb(255, 87, 34)',
            'rgb(211, 47, 47)'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Extracted Features'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  };

  const handleEventSelect = (event: EventData) => {
    try {
      if (!event.raw_data || event.raw_data.length === 0) {
        throw new Error('No raw data available for this event');
      }

      // Clear existing analysis first
      setAnalysisData(null);
      setSelectedEvent(null);
      destroyCharts();
      
      const decodedData = decodeRawData(event.raw_data);
      const weights = decodedData.measurements.map((m: { weight: number }) => m.weight);
      const features = extractFeatures(weights);

      setAnalysisData({ decodedData, features });
      setSelectedEvent(event);
      setError('');
      
      // Create charts after state is set
      setTimeout(() => {
        createWeightChart(decodedData, features);
        createAnalysisChart(features);
      }, 50);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setAnalysisData(null);
    }
  };

  // Get litterbox events with raw data
  const litterboxEvents = events.filter(event => 
    event.data && 
    typeof event.data === 'object' &&
    'type' in event.data &&
    event.data.type === 'litterbox_use' && 
    event.raw_data && 
    event.raw_data.length > 0
  );

  return (
    <div 
      className="litterbox-analyzer"
      ref={ref}
      {...(className && { className })}
    >
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}
      {litterboxEvents.length > 0 && (
        <div className="event-selector">
          <h3>📋 Select Event to Analyze ({litterboxEvents.length} available)</h3>
          <div className="event-list">
            {litterboxEvents.map((event) => (
              <div
                key={event.id}
                className={`event-card ${selectedEvent?.id === event.id ? 'selected' : ''}`}
                onClick={() => handleEventSelect(event)}
              >
                <div className="event-meta">
                  {new Date(event.timestamp).toLocaleString()}
                  {event.human_verified && <span className="verified-badge">✅ Verified</span>}
                </div>
                <div className="event-type">
                  {String(getEventDataProp(event.data, 'elimination_type') || 'unknown')} - {String(getEventDataProp(event.data, 'elimination_weight') || 'N/A')}g - {typeof getEventDataProp(event.data, 'duration') === 'number' ? `${(Number(getEventDataProp(event.data, 'duration')) / 1000).toFixed(1)}s` : 'N/A'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysisData && selectedEvent && (
        <div className="analysis-results">
          <h2>📊 Event Visualization</h2>
          <div className="chart-container">
            <canvas ref={weightChartRef} />
          </div>

          {/* Phase Markers */}
          <div className="phase-markers">
            <h3>Detected Phases ({String(getEventDataProp(selectedEvent.data, 'elimination_type') || 'unknown')} - {selectedEvent.human_verified ? '✅ Human Verified' : '⚠️ Unverified'}):</h3>
            <span className="phase-marker phase-entry">Step In: {(analysisData.features.phases.stepIn/10).toFixed(1)}s</span>
            <span className="phase-marker phase-elimination">Pre-elimination: {((analysisData.features.phases.eliminationStart-analysisData.features.phases.stepIn)/10).toFixed(1)}s</span>
            <span className="phase-marker phase-elimination">Elimination: {((analysisData.features.phases.eliminationEnd-analysisData.features.phases.eliminationStart)/10).toFixed(1)}s</span>
            <span className="phase-marker phase-covering">Covering: {((analysisData.features.phases.stepOut-analysisData.features.phases.eliminationEnd)/10).toFixed(1)}s</span>
            <span className="phase-marker phase-exit">Step Out: {(analysisData.features.phases.stepOut/10).toFixed(1)}s</span>
          </div>

          {/* Features Grid */}
          <h2>🔍 Extracted Features</h2>
          <div className="features-grid">
            {[
              { label: 'Total Duration', value: `${analysisData.features.totalDuration.toFixed(1)}s`, color: '#007AFF' },
              { label: 'Pre-elimination Time', value: `${analysisData.features.preEliminationDuration.toFixed(1)}s`, color: '#1976d2' },
              { label: 'Elimination Duration', value: `${analysisData.features.eliminationDuration.toFixed(1)}s`, color: '#f57c00' },
              { label: 'Covering Duration', value: `${analysisData.features.coveringDuration.toFixed(1)}s`, color: '#7b1fa2' },
              { label: 'Waste Weight', value: `${analysisData.features.wasteWeight.toFixed(1)}g`, color: '#d32f2f' },
              { label: 'Elimination Rate', value: `${analysisData.features.eliminationRate.toFixed(2)}g/s`, color: '#388e3c' },
              { label: 'Covering Variance', value: analysisData.features.coveringVariance.toFixed(0), color: '#ff5722' },
              { label: 'Covering Fluctuations', value: String(analysisData.features.coveringFluctuations), color: '#9c27b0' },
              { label: 'Covering Spectral Entropy', value: analysisData.features.coveringSpectralEntropy.toFixed(3), color: '#607d8b' },
              { label: 'Pre-elimination Variance', value: analysisData.features.preEliminationVariance.toFixed(0), color: '#795548' },
              { label: 'Max Weight', value: `${analysisData.features.maxWeight.toFixed(1)}g`, color: '#ff9800' },
              { label: 'Weight Change', value: `${(analysisData.features.finalWeight - analysisData.features.initialWeight).toFixed(1)}g`, color: '#4caf50' }
            ].map((feature, index) => (
              <div key={index} className="feature-card" style={{ borderLeftColor: feature.color }}>
                <div className="feature-value">{feature.value}</div>
                <div className="feature-label">{feature.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

LitterboxAnalyzer.displayName = "LitterboxAnalyzer";

export { type LitterboxAnalyzerProps };
export default LitterboxAnalyzer;
