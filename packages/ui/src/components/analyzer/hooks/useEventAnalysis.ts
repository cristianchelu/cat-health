import { useState, useCallback } from 'react';
import type { EventData, DecodedData, Features } from '../types';
import { decodeRawData } from '../lib/binaryDecoder';
import { extractFeatures } from '../lib/featureExtraction';

export const useEventAnalysis = () => {
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [analysisData, setAnalysisData] = useState<{
    decodedData: DecodedData;
    features: Features;
  } | null>(null);
  const [error, setError] = useState<string>('');

  const analyzeEvent = useCallback((event: EventData) => {
    try {
      if (!event.raw_data || event.raw_data.length === 0) {
        throw new Error('No raw data available for this event');
      }

      // Clear existing analysis first
      setAnalysisData(null);
      setSelectedEvent(null);
      
      const decodedData = decodeRawData(event.raw_data);
      const weights = decodedData.measurements.map((m: { weight: number }) => m.weight);
      const features = extractFeatures(weights);

      setAnalysisData({ decodedData, features });
      setSelectedEvent(event);
      setError('');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setAnalysisData(null);
    }
  }, []);

  const clearAnalysis = useCallback(() => {
    setSelectedEvent(null);
    setAnalysisData(null);
    setError('');
  }, []);

  return {
    selectedEvent,
    analysisData,
    error,
    analyzeEvent,
    clearAnalysis
  };
};
