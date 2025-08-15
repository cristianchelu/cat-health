import { useMemo } from 'react';
import type { EventData, ProcessedEventData } from '../types';
import { decodeRawData } from '../lib/binaryDecoder';
import { extractFeatures } from '../lib/featureExtraction';
import { getEventDataProp, filterLitterboxEvents } from '../lib/utils';

export const useScatterData = (events: EventData[], selectedEvent: EventData | null) => {
  const litterboxEvents = useMemo(() => filterLitterboxEvents(events), [events]);

  const scatterData = useMemo((): ProcessedEventData[] | null => {
    if (selectedEvent || litterboxEvents.length === 0) {
      return null;
    }

    const processedEvents = [];
    
    for (const event of litterboxEvents) {
      try {
        if (!event.raw_data || event.raw_data.length === 0) continue;
        
        const decodedData = decodeRawData(event.raw_data);
        const weights = decodedData.measurements.map((m: { weight: number }) => m.weight);
        const features = extractFeatures(weights);
        const eliminationType = String(getEventDataProp(event.data, 'elimination_type') || 'unknown');
        
        processedEvents.push({
          event,
          features,
          eliminationType
        });
      } catch (err) {
        // Skip events that can't be processed
        console.warn(`Failed to process event ${event.id}:`, err);
      }
    }
    
    return processedEvents;
  }, [selectedEvent, litterboxEvents]);

  return {
    litterboxEvents,
    scatterData
  };
};
