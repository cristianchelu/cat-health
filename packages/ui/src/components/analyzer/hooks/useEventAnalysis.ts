import { useState, useEffect } from 'react';
import type { EventData, DecodedData, Features } from '../types';
import { decodeRawData } from '../lib/binaryDecoder';
import { extractFeatures } from '../lib/featureExtraction';

export const useEventAnalysis = (selectedEvent: EventData | null, catWeights: number[]) => {
  const [analysisData, setAnalysisData] = useState<{
    decodedData: DecodedData;
    features: Features;
  } | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!selectedEvent) {
      setAnalysisData(null);
      setError('');
      return;
    }
    try {
      if (!selectedEvent.raw_data || selectedEvent.raw_data.length === 0) {
        throw new Error('No raw data available for this event');
      }
      const decodedData = decodeRawData(selectedEvent.raw_data);
      const weights = decodedData.measurements.map((m: { weight: number }) => m.weight);
      const features = extractFeatures(weights, catWeights);
      setAnalysisData({ decodedData, features });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setAnalysisData(null);
    }
  }, [selectedEvent?.id]);

  return {
    analysisData,
    error
  };
};
