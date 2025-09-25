// RMS of derivative helper
export const calculateRmsDerivative = (signal: number[]): number => {
  if (signal.length < 2) return 0;
  let sumSq = 0;
  for (let i = 1; i < signal.length; i++) {
    const diff = signal[i] - signal[i - 1];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / (signal.length - 1));
};

import type { Features, FeatureDimension, StatePeriod } from '../types';
import { LitterboxStateTracker } from './stateTracker';

// Helper functions for feature extraction
export const calculateFilteredVariance = (
  signal: number[],
  outlierPercentile = 95,
): number => {
  if (signal.length === 0) return 0;

  const mean = signal.reduce((s, w) => s + w, 0) / signal.length;
  const deviations = signal.map((w) => Math.abs(w - mean));
  const sortedDeviations = [...deviations].sort((a, b) => a - b);
  const percentileIndex = Math.floor(
    (sortedDeviations.length * outlierPercentile) / 100,
  );
  const outlierThreshold =
    sortedDeviations[Math.min(percentileIndex, sortedDeviations.length - 1)];

  const filteredSignal = signal.filter(
    (_, i) => deviations[i] <= outlierThreshold,
  );

  if (filteredSignal.length === 0) return 0;

  const filteredMean =
    filteredSignal.reduce((s, w) => s + w, 0) / filteredSignal.length;
  const variance =
    filteredSignal.reduce((s, w) => s + Math.pow(w - filteredMean, 2), 0) /
    filteredSignal.length;

  return Math.sqrt(variance);
};

export const calculateSpectralEntropy = (signal: number[]): number => {
  if (signal.length < 8) return 0;

  const windowSize = Math.min(8, Math.floor(signal.length / 4));
  const powers = [];

  for (let i = 0; i <= signal.length - windowSize; i++) {
    const window = signal.slice(i, i + windowSize);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const variance =
      window.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / window.length;
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

export const countPeaks = (signal: number[], prominence = 20): number => {
  if (signal.length < 3) return 0;

  let peaks = 0;
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      const leftMin = Math.min(...signal.slice(Math.max(0, i - 5), i));
      const rightMin = Math.min(
        ...signal.slice(i + 1, Math.min(signal.length, i + 6)),
      );
      if (signal[i] - Math.max(leftMin, rightMin) > prominence) {
        peaks++;
      }
    }
  }
  return peaks;
};

// Calculate features with state machine approach
export const extractFeatures = (
  weights: number[],
  cats: number[],
  sampleRate = 10,
): Features => {
  const tracker = new LitterboxStateTracker(cats);
  const result = tracker.processEvent(weights);
  const timeStep = 1 / sampleRate;

  const features: Features = {
    preEliminationDuration: 0, //(phases.eliminationStart - phases.stepIn) * timeStep,
    eliminationDuration: 0, //(phases.eliminationEnd - phases.eliminationStart) * timeStep,
    coveringDuration: 0, //(phases.stepOut - phases.eliminationEnd) * timeStep,
    totalDuration: weights.length * timeStep,

    wasteWeight: weights[weights.length - 1],
    maxWeight: Math.max(...weights),
    initialWeight: weights[0],
    finalWeight: weights[weights.length - 1],

    coveringVariance: 0,
    coveringFluctuations: 0,
    coveringSpectralEntropy: 0,
    preEliminationVariance: 0,
    eliminationRate: 0,
    eliminationVariance: 0,
    eliminationRmsDerivative: 0,

    periods: result.periods,
  };

  features.eliminationRate =
    features.eliminationDuration > 0
      ? features.wasteWeight / features.eliminationDuration
      : 0;

  const eliminations = result.periods
    .filter((p) => p.state === 'eliminating')
    .filter((p) => (p.variance || 0) < 20); // Exclude high variance eliminations likely due to noise

  const chooseLongest = (candidates: Array<StatePeriod>) => {
    return candidates.reduce((a, b) =>
      b.end - b.start > a.end - a.start ? b : a,
    );
  };

  // If multiple elimination candidates, choose the one with the highest
  // variance "walls" 1second before and after.
  const chooseHighestNeighboringVariance = (candidates: Array<StatePeriod>) => {
    return candidates.reduce((a, b) => {
      const aNeighbors = weights.slice(a.start - 1, a.end + 2);
      const bNeighbors = weights.slice(b.start - 1, b.end + 2);
      const aVariance = calculateFilteredVariance(aNeighbors);
      const bVariance = calculateFilteredVariance(bNeighbors);
      return aVariance > bVariance ? a : b;
    });
  };

  const chooseSymmetricHighestNeighboringVariance = (
    candidates: Array<StatePeriod>,
  ) => {
    return candidates.reduce((a, b) => {
      const aNeighbors = weights.slice(a.start - 1, a.end + 2);
      const bNeighbors = weights.slice(b.start - 1, b.end + 2);
      const aVariance = Math.abs(
        calculateFilteredVariance(aNeighbors.slice(0, 1)) -
          calculateFilteredVariance(aNeighbors.slice(-1)),
      );
      const bVariance = Math.abs(
        calculateFilteredVariance(bNeighbors.slice(0, 1)) -
          calculateFilteredVariance(bNeighbors.slice(-1)),
      );
      return aVariance > bVariance ? a : b;
    });
  };
  const chooseLatest = (candidates: Array<StatePeriod>) => {
    return candidates.reduce((a, b) => (b.start > a.start ? b : a));
  };

  const sectionSelectionStrategy = {
    latest: chooseLatest,
    longest: chooseLongest,
    highestNeighboringVariance: chooseHighestNeighboringVariance,
    symmetricHighestNeighboringVariance:
      chooseSymmetricHighestNeighboringVariance,
  };

  if (eliminations.length > 0) {
    const elimination = sectionSelectionStrategy['latest'](eliminations);
    const elimSignal = weights.slice(
      elimination.start + 10,
      elimination.end - 10,
    );
    features.eliminationVariance = calculateFilteredVariance(elimSignal, 90); //elimination.variance ?? 0;
    features.eliminationRmsDerivative = calculateRmsDerivative(elimSignal);
    features.eliminationDuration =
      (elimination.end - elimination.start) * timeStep;
    features.eliminationRate =
      features.eliminationDuration > 0
        ? features.wasteWeight / features.eliminationDuration
        : 0;

    // Find preSignal: last occupied before elimination
    const occupiedBefore = result.periods.filter(
      (p) => p.state === 'occupied' && p.end <= elimination.start,
    );
    const preSignalPeriod =
      occupiedBefore.length > 0
        ? occupiedBefore[occupiedBefore.length - 1]
        : undefined;
    if (preSignalPeriod) {
      const preSignal = weights.slice(
        preSignalPeriod.start,
        preSignalPeriod.end,
      );
      if (preSignal.length > 0) {
        features.preEliminationVariance = calculateFilteredVariance(preSignal);
        features.preEliminationDuration =
          (preSignalPeriod.end - preSignalPeriod.start) * timeStep;
      }
    }

    // Find coveringSignal: first occupied after elimination
    const occupiedAfter = result.periods.filter(
      (p) => p.state === 'occupied' && p.start >= elimination.end,
    );
    const coveringSignalPeriod =
      occupiedAfter.length > 0 ? occupiedAfter[0] : undefined;
    if (coveringSignalPeriod) {
      const coveringSignal = weights.slice(
        coveringSignalPeriod.start,
        coveringSignalPeriod.end,
      );
      if (coveringSignal.length > 0) {
        features.coveringVariance = calculateFilteredVariance(coveringSignal);
        features.coveringFluctuations = countPeaks(coveringSignal);
        features.coveringSpectralEntropy =
          calculateSpectralEntropy(coveringSignal);
        features.coveringDuration =
          (coveringSignalPeriod.end - coveringSignalPeriod.start) * timeStep;
      }
    }
  }

  return features;
};

// Available feature dimensions for scatter plot
export const featureDimensions: FeatureDimension[] = [
  {
    key: 'preEliminationDuration',
    label: 'Pre-elimination Duration (s)',
    unit: 's',
  },
  { key: 'eliminationDuration', label: 'Elimination Duration (s)', unit: 's' },
  { key: 'coveringDuration', label: 'Covering Duration (s)', unit: 's' },
  { key: 'totalDuration', label: 'Total Duration (s)', unit: 's' },
  { key: 'wasteWeight', label: 'Waste Weight (g)', unit: 'g' },
  { key: 'maxWeight', label: 'Max Weight (g)', unit: 'g' },
  { key: 'coveringVariance', label: 'Covering Variance', unit: '' },
  {
    key: 'coveringFluctuations',
    label: 'Covering Fluctuations',
    unit: 'peaks',
  },
  {
    key: 'coveringSpectralEntropy',
    label: 'Covering Spectral Entropy',
    unit: '',
  },
  {
    key: 'preEliminationVariance',
    label: 'Pre-elimination Variance',
    unit: '',
  },
  { key: 'eliminationRate', label: 'Elimination Rate (g/s)', unit: 'g/s' },
  { key: 'eliminationVariance', label: 'Elimination Variance', unit: '' },
  {
    key: 'eliminationRmsDerivative',
    label: 'Elimination RMS Derivative',
    unit: '',
  },
];

// Get feature value by key
export const getFeatureValue = (features: Features, key: string): number => {
  switch (key) {
    case 'preEliminationDuration':
      return features.preEliminationDuration;
    case 'eliminationDuration':
      return features.eliminationDuration;
    case 'coveringDuration':
      return features.coveringDuration;
    case 'totalDuration':
      return features.totalDuration;
    case 'wasteWeight':
      return features.wasteWeight;
    case 'maxWeight':
      return features.maxWeight;
    case 'coveringVariance':
      return features.coveringVariance;
    case 'coveringFluctuations':
      return features.coveringFluctuations;
    case 'coveringSpectralEntropy':
      return features.coveringSpectralEntropy;
    case 'preEliminationVariance':
      return features.preEliminationVariance;
    case 'eliminationRate':
      return features.eliminationRate;
    case 'eliminationVariance':
      return features.eliminationVariance;
    case 'eliminationRmsDerivative':
      return features.eliminationRmsDerivative;
    default:
      return 0;
  }
};
