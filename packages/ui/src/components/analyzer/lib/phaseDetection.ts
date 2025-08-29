import type { PhaseData, PhaseDetectionResult, StateTimelineEntry } from '../types';
import { LitterboxStateTracker } from './stateTracker';

// Helper function to calculate rolling variance
const calculateRollingVariance = (weights: number[], windowSize: number = 10): number[] => {
  const variances: number[] = [];
  
  for (let i = 0; i < weights.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(weights.length, i + Math.floor(windowSize / 2) + 1);
    const window = weights.slice(start, end);
    
    if (window.length < 2) {
      variances.push(Infinity);
      continue;
    }
    
    const mean = window.reduce((sum, w) => sum + w, 0) / window.length;
    const variance = window.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / window.length;
    variances.push(variance);
  }
  
  return variances;
};

// Find the longest stable period during occupied state
const findLongestStablePeriod = (stateTimeline: StateTimelineEntry[], weights: number[]): { start: number; end: number } => {
  const varianceThreshold = 250;
  const variances = calculateRollingVariance(weights);
  
  // Find all occupied periods
  const occupiedPeriods: { start: number; end: number }[] = [];
  let currentStart = -1;
  
  for (let i = 0; i < stateTimeline.length; i++) {
    const isOccupied = stateTimeline[i].state === 'occupied';
    
    if (isOccupied && currentStart === -1) {
      currentStart = i;
    } else if (!isOccupied && currentStart !== -1) {
      occupiedPeriods.push({ start: currentStart, end: i - 1 });
      currentStart = -1;
    }
  }
  
  // Handle case where occupied state continues to the end
  if (currentStart !== -1) {
    occupiedPeriods.push({ start: currentStart, end: stateTimeline.length - 1 });
  }
  
  // Find longest stable period within occupied periods
  let longestStable = { start: -1, end: -1, duration: 0 };
  
  for (const period of occupiedPeriods) {
    let stableStart = -1;
    
    for (let i = period.start; i <= period.end; i++) {
      const isStable = variances[i] < varianceThreshold;
      
      if (isStable && stableStart === -1) {
        stableStart = i;
      } else if (!isStable && stableStart !== -1) {
        const duration = i - stableStart;
        if (duration > longestStable.duration) {
          longestStable = { start: stableStart, end: i - 1, duration };
        }
        stableStart = -1;
      }
    }
    
    // Handle stable period that continues to end of occupied period
    if (stableStart !== -1) {
      const duration = period.end - stableStart + 1;
      if (duration > longestStable.duration) {
        longestStable = { start: stableStart, end: period.end, duration };
      }
    }
  }
  
  return { start: longestStable.start, end: longestStable.end };
};

export const extractPhasesFromStates = (stateTimeline: StateTimelineEntry[], weights: number[]): PhaseData => {
  // Find key phase boundaries from state transitions
  const entry = 0;
  let stepIn = -1;
  let eliminationStart = -1;
  let eliminationEnd = -1;
  let stepOut = -1;
  const exit = stateTimeline.length - 1;
  
  // Find first entry (transition to ENTERING or OCCUPIED)
  for (let i = 0; i < stateTimeline.length; i++) {
    const state = stateTimeline[i].state;
    if (state === 'entering' || state === 'occupied') {
      stepIn = i;
      break;
    }
  }
  
  // Find the longest stable period during occupied state for elimination detection
  const stablePeriod = findLongestStablePeriod(stateTimeline, weights);
  if (stablePeriod.start !== -1 && stablePeriod.end !== -1) {
    eliminationStart = stablePeriod.start;
    eliminationEnd = stablePeriod.end;
  }
  
  // Find final exit (transition to ended state or end of timeline)
  for (let i = Math.max(eliminationEnd, 0); i < stateTimeline.length; i++) {
    const state = stateTimeline[i].state;
    if (state === 'ended') {
      stepOut = i;
      break;
    }
  }
  
  // Fallback values if phases not found
  if (stepIn === -1) stepIn = Math.floor(stateTimeline.length * 0.1);
  if (eliminationStart === -1) eliminationStart = Math.floor(stateTimeline.length * 0.3);
  if (eliminationEnd === -1) eliminationEnd = Math.floor(stateTimeline.length * 0.7);
  if (stepOut === -1) stepOut = Math.floor(stateTimeline.length * 0.9);
  
  return {
    entry,
    stepIn,
    eliminationStart,
    eliminationEnd,
    stepOut,
    exit
  };
};

export const detectPhasesWithEvents = (weights: number[]): PhaseDetectionResult => {
  const tracker = new LitterboxStateTracker([6.6, 4.4]);
  tracker.reset(); // Ensure clean state for new analysis
  const stateTimeline: StateTimelineEntry[] = [];
  
  // Process each sample
  for (let i = 0; i < weights.length; i++) {
    const result = tracker.processSample(weights[i], i);
    stateTimeline.push({
      index: i,
      weight: weights[i],
      ...result
    });
  }
  
  // Extract phases from state timeline
  const phases = extractPhasesFromStates(stateTimeline, weights);
  
  return {
    phases,
    catWeight: tracker.getCatWeight(),
    events: tracker.getEvents(),
    stateTimeline // For visualization
  };
};
