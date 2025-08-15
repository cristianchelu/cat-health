import * as React from "react";
import type { LitterboxAnalyzerProps } from './types';
import { useEventAnalysis } from './hooks/useEventAnalysis';
import { useChartManager } from './hooks/useChartManager';
import { useScatterData } from './hooks/useScatterData';
import EventSelector from './components/EventSelector';
import ScatterAnalysis from './components/ScatterAnalysis';
import AnalysisResults from './components/AnalysisResults';
import './LitterboxAnalyzer.css';

const LitterboxAnalyzer = React.forwardRef<HTMLDivElement, LitterboxAnalyzerProps>(
  ({ events, className }, ref) => {
    const { selectedEvent, analysisData, error, analyzeEvent } = useEventAnalysis();
    const { 
      scatterChartRef,
      scatterChartInstance
    } = useChartManager();
    const { litterboxEvents, scatterData } = useScatterData(events, selectedEvent);

    return (
      <div 
        className={`litterbox-analyzer${analysisData && selectedEvent ? ' has-analysis' : ''}${className ? ` ${className}` : ''}`}
        ref={ref}
      >
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        {litterboxEvents.length > 0 && (
          <EventSelector
            events={litterboxEvents}
            selectedEvent={selectedEvent}
            onEventSelect={analyzeEvent}
            hasAnalysis={!!(analysisData && selectedEvent)}
          />
        )}

        {/* Scatter Chart - Show when no event is selected */}
        {!selectedEvent && scatterData && scatterData.length > 0 && (
          <ScatterAnalysis
            scatterData={scatterData}
            onEventSelect={analyzeEvent}
            chartRef={scatterChartRef}
            chartInstance={scatterChartInstance}
          />
        )}

        {/* Analysis Results */}
        {analysisData && selectedEvent && (
          <AnalysisResults
            selectedEvent={selectedEvent}
            analysisData={analysisData}
          />
        )}
      </div>
    );
  }
);

LitterboxAnalyzer.displayName = "LitterboxAnalyzerRefactored";

export { type LitterboxAnalyzerProps };
export default LitterboxAnalyzer;
