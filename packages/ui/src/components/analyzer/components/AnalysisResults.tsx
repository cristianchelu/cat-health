import * as React from 'react';
import WeightChart from './WeightChart';
import PhaseMarkers from './PhaseMarkers';
import type { EventData, Features, DecodedData } from '../types';

import './AnalysisResults.css';

interface AnalysisResultsProps {
  selectedEvent: EventData;
  analysisData: {
    decodedData: DecodedData;
    features: Features;
  };
  className?: string;
  catWeights: number[];
}

const AnalysisResults = React.forwardRef<HTMLDivElement, AnalysisResultsProps>(
  ({ selectedEvent, analysisData, className, catWeights }, ref) => {
    const weightChartRef = React.useRef<HTMLCanvasElement>(null);

    return (
      <div
        className={`analysis-results${className ? ` ${className}` : ''}`}
        ref={ref}
      >
        <h2>📊 Event Visualization</h2>

        <WeightChart
          selectedEvent={selectedEvent}
          analysisData={analysisData}
          ref={weightChartRef}
          catWeights={catWeights}
        />
        <PhaseMarkers features={analysisData.features} />
      </div>
    );
  },
);

AnalysisResults.displayName = 'AnalysisResults';

export { type AnalysisResultsProps };
export default AnalysisResults;
