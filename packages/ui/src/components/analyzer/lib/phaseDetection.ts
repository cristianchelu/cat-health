import type { PhaseData, PhaseDetectionResult, StateTimelineEntry } from '../types';
import { LitterboxStateTracker } from './stateTracker';

export const extractPhasesFromStates = (stateTimeline: StateTimelineEntry[]): PhaseData => {
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
  
  // Find when cat becomes stably occupied (elimination period start)
  for (let i = stepIn; i < stateTimeline.length; i++) {
    if (stateTimeline[i].state === 'occupied') {
      eliminationStart = i;
      break;
    }
  }
  
  // Find end of stable occupation (start of exit behavior)
  // Look for transitions to hesitating, short_exit, exiting, or ended
  for (let i = eliminationStart; i < stateTimeline.length; i++) {
    const state = stateTimeline[i].state;
    if (state === 'hesitating' || state === 'short_exit' || state === 'exiting' || state === 'ended') {
      eliminationEnd = i;
      break;
    }
  }
  
  // Find final exit (transition to ended state or end of timeline)
  for (let i = eliminationEnd; i < stateTimeline.length; i++) {
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
  const tracker = new LitterboxStateTracker();
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
  const phases = extractPhasesFromStates(stateTimeline);
  
  return {
    phases,
    catWeight: tracker.getCatWeight(),
    events: tracker.getEvents(),
    stateTimeline // For visualization
  };
};
