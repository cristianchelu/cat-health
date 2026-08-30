export {
  analyzeWaterSegments,
  analyzeWaterRates,
  DRINKING_RATE_MIN_ML_PER_MIN,
  DRINKING_RATE_MAX_ML_PER_MIN,
  type WaterRateSeries,
} from './analyzeWaterSegments.ts';
export {
  analyzeDrinkingFromSamples,
  weightSamplesAtFixedHz,
} from './analyzeDrinkingFromSamples.ts';
export type {
  DrinkingAnalysis,
  WaterPeriod,
  WaterSegmentState,
  WeightSample,
} from './types.ts';
