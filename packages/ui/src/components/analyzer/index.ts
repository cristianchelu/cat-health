// Main components
export { default as LitterboxAnalyzer } from './LitterboxAnalyzer';

// Sub-components
export { default as EventSelector } from './components/EventSelector';
export { default as EventCard } from './components/EventCard';
export { default as ScatterAnalysis } from './components/ScatterAnalysis';
export { default as WeightChart } from './components/WeightChart';
export { default as PhaseMarkers } from './components/PhaseMarkers';
export { default as AnalysisResults } from './components/AnalysisResults';

// Hooks
export { useEventAnalysis } from './hooks/useEventAnalysis';
export { useChartManager } from './hooks/useChartManager';
export { useScatterData } from './hooks/useScatterData';

// Types
export * from './types';

// Utilities
export * from './lib/binaryDecoder';
export * from './lib/stateTracker';
export * from './lib/featureExtraction';
export * from './lib/utils';
export * from './lib/chartHelpers';
