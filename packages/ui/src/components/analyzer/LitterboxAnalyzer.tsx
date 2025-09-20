import * as React from 'react';
import { useState } from 'react';
import type { EventData, LitterboxAnalyzerProps } from './types';
import { useEventAnalysis } from './hooks/useEventAnalysis';
import { useChartManager } from './hooks/useChartManager';
import { useScatterData } from './hooks/useScatterData';
import EventSelector from './components/EventSelector';
import ScatterAnalysis from './components/ScatterAnalysis';
import AnalysisResults from './components/AnalysisResults';
import { cn } from '@/lib/utils';
import { getLatestCatWeights } from './lib/utils';

import './LitterboxAnalyzer.css';

const LitterboxAnalyzer = React.forwardRef<
  HTMLDivElement,
  LitterboxAnalyzerProps
>(({ events, className }, ref) => {
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const catWeights = getLatestCatWeights(events, selectedEvent?.timestamp);
  const { analysisData, error } = useEventAnalysis(selectedEvent, catWeights);
  const { scatterChartRef, scatterChartInstance } = useChartManager();
  const { litterboxEvents, scatterData } = useScatterData(
    events,
    selectedEvent,
  );

  const selectEvent = (event: EventData) =>
    event.id === selectedEvent?.id
      ? setSelectedEvent(null)
      : setSelectedEvent(event);

  return (
    <div className={cn('litterbox-analyzer', className)} ref={ref}>
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {litterboxEvents.length > 0 && (
        <EventSelector
          events={litterboxEvents}
          selectedEvent={selectedEvent}
          onEventSelect={selectEvent}
        />
      )}

      {/* Scatter Chart - Show when no event is selected */}
      {!selectedEvent && scatterData && scatterData.length > 0 && (
        <ScatterAnalysis
          scatterData={scatterData}
          onEventSelect={selectEvent}
          chartRef={scatterChartRef}
          chartInstance={scatterChartInstance}
        />
      )}

      {/* Analysis Results */}
      {analysisData && selectedEvent && (
        <AnalysisResults
          selectedEvent={selectedEvent}
          analysisData={analysisData}
          catWeights={catWeights}
        />
      )}
    </div>
  );
});

LitterboxAnalyzer.displayName = 'LitterboxAnalyzerRefactored';

export { type LitterboxAnalyzerProps };
export default LitterboxAnalyzer;
