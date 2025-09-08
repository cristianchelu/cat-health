import type { Features, FeatureDimension } from '../types';
import { detectPhasesWithEvents } from './phaseDetection';

// Helper functions for feature extraction
export const calculateFilteredVariance = (signal: number[], outlierPercentile = 95): number => {
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
  
  return Math.sqrt(variance);
};

export const calculateSpectralEntropy = (signal: number[]): number => {
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

export const countPeaks = (signal: number[], prominence = 20): number => {
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

// Calculate features with state machine approach
export const extractFeatures = (weights: number[], sampleRate = 10): Features => {
  const result = detectPhasesWithEvents(weights);
  const phases = result.phases;
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
    eliminationVariance: 0,
    
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

  // Calculate elimination variance

  // const hasOneElimination = result.finalStatePeriods.filter(p => p.state === 'eliminating').length === 1;
  // const elimination = hasOneElimination ? result.finalStatePeriods.find(p => p.state === 'eliminating') : null;
  // if (elimination) {
  //   const eliminationSignal = weights.slice(elimination.start, elimination.end + 1);
  //   if (eliminationSignal.length > 0) {
  //     features.eliminationVariance = calculateFilteredVariance(eliminationSignal);
  //   }
  // }

  const eliminations = result.finalStatePeriods.filter(p => p.state === 'eliminating').map(p=>{
    const buffer = 5;
    const start = p.start + buffer;
    const end = p.end - buffer * 2;
    return {
      ...p,
      variance: calculateFilteredVariance(weights.slice(start, end + 1))
    }
  }).filter(p => p.variance < 1000); // Exclude high variance eliminations likely due to noise

  const chooseLongest = (candidates: Array<{start: number, end: number}>) => {
    return candidates.reduce((a, b) => (b.end - b.start) > (a.end - a.start) ? b : a);
  };
  // If multiple elimination candidates, choose the one with the highest
  // variance "walls" 1second before and after.
  const chooseHighestNeighboringVariance = (candidates: Array<{start: number, end: number, variance: number}>) => {
    return candidates.reduce((a, b) => {
      const aNeighbors = weights.slice(a.start - 1, a.end + 2);
      const bNeighbors = weights.slice(b.start - 1, b.end + 2);
      const aVariance = calculateFilteredVariance(aNeighbors);
      const bVariance = calculateFilteredVariance(bNeighbors);
      return aVariance > bVariance ? a : b;
    });
  };

  const chooseSymmetricHighestNeighboringVariance = (candidates: Array<{start: number, end: number, variance: number}>) => {
    return candidates.reduce((a, b) => {
      const aNeighbors = weights.slice(a.start - 1, a.end + 2);
      const bNeighbors = weights.slice(b.start - 1, b.end + 2);
      const aVariance = Math.abs(calculateFilteredVariance(aNeighbors.slice(0, 1)) - calculateFilteredVariance(aNeighbors.slice(-1)));
      const bVariance = Math.abs(calculateFilteredVariance(bNeighbors.slice(0, 1)) - calculateFilteredVariance(bNeighbors.slice(-1)));
      return aVariance > bVariance ? a : b;
    });
  }

  const sectionSelectionStrategy = {
    'longest': chooseLongest,
    'highestNeighboringVariance': chooseHighestNeighboringVariance,
    'symmetricHighestNeighboringVariance': chooseSymmetricHighestNeighboringVariance
  }

  
  if (eliminations.length > 0) {
    const selected = sectionSelectionStrategy['symmetricHighestNeighboringVariance'](eliminations);

    features.eliminationVariance = selected.variance;
    features.eliminationDuration = (selected.end - selected.start) * timeStep;
    features.eliminationRate = features.eliminationDuration > 0 ? 
      features.wasteWeight / features.eliminationDuration : 0;
  }

  return features;
};

// Available feature dimensions for scatter plot
export const featureDimensions: FeatureDimension[] = [
  { key: 'preEliminationDuration', label: 'Pre-elimination Duration (s)', unit: 's' },
  { key: 'eliminationDuration', label: 'Elimination Duration (s)', unit: 's' },
  { key: 'coveringDuration', label: 'Covering Duration (s)', unit: 's' },
  { key: 'totalDuration', label: 'Total Duration (s)', unit: 's' },
  { key: 'wasteWeight', label: 'Waste Weight (g)', unit: 'g' },
  { key: 'maxWeight', label: 'Max Weight (g)', unit: 'g' },
  { key: 'coveringVariance', label: 'Covering Variance', unit: '' },
  { key: 'coveringFluctuations', label: 'Covering Fluctuations', unit: 'peaks' },
  { key: 'coveringSpectralEntropy', label: 'Covering Spectral Entropy', unit: '' },
  { key: 'preEliminationVariance', label: 'Pre-elimination Variance', unit: '' },
  { key: 'eliminationRate', label: 'Elimination Rate (g/s)', unit: 'g/s' },
  { key: 'eliminationVariance', label: 'Elimination Variance', unit: '' }
];

// Get feature value by key
export const getFeatureValue = (features: Features, key: string): number => {
  switch (key) {
    case 'preEliminationDuration': return features.preEliminationDuration;
    case 'eliminationDuration': return features.eliminationDuration;
    case 'coveringDuration': return features.coveringDuration;
    case 'totalDuration': return features.totalDuration;
    case 'wasteWeight': return features.wasteWeight;
    case 'maxWeight': return features.maxWeight;
    case 'coveringVariance': return features.coveringVariance;
    case 'coveringFluctuations': return features.coveringFluctuations;
    case 'coveringSpectralEntropy': return features.coveringSpectralEntropy;
    case 'preEliminationVariance': return features.preEliminationVariance;
    case 'eliminationRate': return features.eliminationRate;
    case 'eliminationVariance': return features.eliminationVariance;
    default: return 0;
  }
};
