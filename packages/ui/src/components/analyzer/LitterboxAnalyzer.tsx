import * as React from "react";
import { useState, useRef, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { FaTint, FaPoop, FaQuestion, FaClock, FaCalendarAlt, FaCheck, FaWeight } from 'react-icons/fa';
import './LitterboxAnalyzer.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  annotationPlugin
);

interface EventData {
  id: number;
  timestamp: string;
  data: Record<string, unknown>;
  raw_data?: number[] | null;
  human_verified: boolean;
}

// Helper to safely get event data properties
const getEventDataProp = (data: Record<string, unknown>, key: string): unknown => {
  return data[key];
};

// Helper to get elimination type icon
const getEliminationIcon = (eliminationType: string) => {
  switch (eliminationType) {
    case 'urination':
      return <FaTint className="elimination-icon urination" />;
    case 'defecation':
      return <FaPoop className="elimination-icon defecation" />;
    default:
      return <FaQuestion className="elimination-icon unknown" />;
  }
};

// Binary data decoder
const decodeRawData = (rawDataArray: number[]): DecodedData => {
  if (!rawDataArray || rawDataArray.length === 0) {
    throw new Error('No raw data available');
  }
  
  const uint8Array = new Uint8Array(rawDataArray);
  const buffer = uint8Array.buffer;
  const dataView = new DataView(buffer);
  let offset = 0;
  
  const version = dataView.getUint8(offset);
  offset += 1;
  
  if (version !== 1) {
    throw new Error(`Unsupported version: ${version}`);
  }
  
  const startTimestamp = Number(dataView.getBigUint64(offset, false));
  offset += 8;
  
  const context: DecodedData['context'] = {};
  const wasteWeight = dataView.getUint16(offset, false);
  context.wasteWeight = wasteWeight === 65535 ? undefined : wasteWeight;
  offset += 2;
  
  const litterRemaining = dataView.getUint16(offset, false);
  context.litterRemaining = litterRemaining === 65535 ? undefined : litterRemaining;
  offset += 2;
  
  const deepCleanTimer = dataView.getUint8(offset);
  context.deepCleanTimer = deepCleanTimer === 255 ? undefined : deepCleanTimer;
  offset += 1;
  
  const totalVisits = dataView.getUint8(offset);
  context.totalVisits = totalVisits === 255 ? undefined : totalVisits;
  offset += 1;
  
  const daysSinceLitterReplaced = dataView.getUint8(offset);
  context.daysSinceLitterReplaced = daysSinceLitterReplaced === 255 ? undefined : daysSinceLitterReplaced;
  offset += 1;
  
  const hoursSinceLastScoop = dataView.getUint8(offset);
  context.hoursSinceLastScoop = hoursSinceLastScoop === 255 ? undefined : hoursSinceLastScoop;
  offset += 1;
  
  offset += 2; // Skip reserved
  
  const count = dataView.getUint32(offset, false);
  offset += 4;
  
  const measurements = [];
  for (let i = 0; i < count; i++) {
    const weight = dataView.getInt16(offset, false);
    measurements.push({ weight });
    offset += 2;
  }
  
  return {
    startTime: new Date(startTimestamp),
    measurements,
    context
  };
};

interface StateTransition {
  from: string;
  to: string;
  index: number;
  timestamp: number;
}

interface StateResult {
  state: string;
  catWeight: number;
  events: {
    entries: number;
    exits: number;
    hesitations: number;
  };
}

interface StateTimelineEntry {
  index: number;
  weight: number;
  state: string;
  catWeight: number;
  events: {
    entries: number;
    exits: number;
    hesitations: number;
  };
}

interface PhaseDetectionResult {
  phases: PhaseData;
  catWeight: number;
  events: {
    entries: number;
    exits: number;
    hesitations: number;
  };
  stateTimeline: StateTimelineEntry[];
}

// State machine for cat weight tracking
class LitterboxStateTracker {
  private states = {
    EMPTY: 'empty',
    ENTERING: 'entering', 
    OCCUPIED: 'occupied',
    EXITING: 'exiting',
    HESITATING: 'hesitating',
    SHORT_EXIT: 'short_exit',  // New state for temporary exits
    ENDED: 'ended'              // New state for session end
  };
  
  private currentState: string;
  private baselineWeight: number;
  private catWeight: number;
  private runningMax: number;
  private stableWeightBuffer: number[]; // Small circular buffer
  private bufferSize: number; // Only 2 seconds at 10Hz
  
  // Session management
  private sessionActive: boolean;
  private shortExitCounter: number;
  private maxShortExitDuration: number;  // 5 seconds at 10Hz
  private maxSessionDuration: number;  // 120 seconds at 10Hz
  private sessionStartSample: number;
  private currentSample: number;
  
  // Event counters (within session)
  private entries: number;
  private exits: number;
  private hesitations: number;
  private shortExits: number;  // New counter
  
  // Weight tracking for best stable weight
  private longestStableOccupancy: { duration: number; weight: number };
  private currentOccupancyStart: number;
  
  // Phase tracking
  private phaseTransitions: StateTransition[];
  private currentPhaseStart: number;
  
  // Thresholds
  private entryThreshold: number; // Min weight increase to detect entry
  private exitThreshold: number;    // Fraction of cat weight to detect exit
  private hesitationThreshold: number; // Fraction for hesitation detection
  private stabilityWindow: number;   // Samples to confirm state change
  
  constructor() {
    this.currentState = this.states.EMPTY;
    this.baselineWeight = 0;
    this.catWeight = 0;
    this.runningMax = 0;
    this.stableWeightBuffer = [];
    this.bufferSize = 20;
    
    // Session management
    this.sessionActive = false;
    this.shortExitCounter = 0;
    this.maxShortExitDuration = 50;  // 5 seconds at 10Hz
    this.maxSessionDuration = 1200;  // 120 seconds at 10Hz
    this.sessionStartSample = 0;
    this.currentSample = 0;
    
    // Event counters (within session)
    this.entries = 0;
    this.exits = 0;
    this.hesitations = 0;
    this.shortExits = 0;  // New counter
    
    // Weight tracking for best stable weight
    this.longestStableOccupancy = { duration: 0, weight: 0 };
    this.currentOccupancyStart = 0;
    
    this.phaseTransitions = [];
    this.currentPhaseStart = 0;
    
    this.entryThreshold = 2000;
    this.exitThreshold = 0.3;
    this.hesitationThreshold = 0.7;
    this.stabilityWindow = 10;
  }
  
  processSample(weight: number, index: number): StateResult {
    this.currentSample = index;
    
    // Check for session timeout
    if (this.sessionActive && 
        (this.currentSample - this.sessionStartSample) > this.maxSessionDuration) {
      return this.endSession();
    }
    
    // Update running statistics
    this.updateRunningStats(weight);
    
    // State transitions
    switch(this.currentState) {
      case this.states.EMPTY:
        if (weight > this.baselineWeight + this.entryThreshold) {
          this.startSession();
          this.transitionTo(this.states.ENTERING, index);
          this.entries++;
        }
        break;
        
      case this.states.ENTERING:
        if (this.isStable() && weight > this.runningMax * 0.95) {
          this.updateCatWeight();
          this.currentOccupancyStart = this.currentSample;
          this.transitionTo(this.states.OCCUPIED, index);
        } else if (weight < this.baselineWeight + this.entryThreshold * 0.5) {
          this.hesitations++;
          this.transitionTo(this.states.EMPTY, index);
          // If we never made it to OCCUPIED, end the session
          if (!this.catWeight) {
            return this.endSession();
          }
        }
        break;
        
      case this.states.OCCUPIED:
        // Track duration of stable occupancy
        if (this.isStable()) {
          const duration = this.currentSample - this.currentOccupancyStart;
          const stableWeight = this.getStableWeight();
          if (duration > this.longestStableOccupancy.duration) {
            this.longestStableOccupancy = { duration, weight: stableWeight };
            this.catWeight = stableWeight;  // Update cat weight with best stable reading
          }
        }
        
        if (weight < this.catWeight * this.exitThreshold) {
          this.shortExitCounter = 0;  // Reset counter when starting potential exit
          this.transitionTo(this.states.SHORT_EXIT, index);
        } else if (weight < this.catWeight * this.hesitationThreshold) {
          this.transitionTo(this.states.HESITATING, index);
        }
        break;
        
      case this.states.HESITATING:
        if (weight > this.catWeight * 0.9) {
          this.transitionTo(this.states.OCCUPIED, index);
        } else if (weight < this.catWeight * this.exitThreshold) {
          this.shortExitCounter = 0;
          this.transitionTo(this.states.SHORT_EXIT, index);
        }
        break;
        
      case this.states.SHORT_EXIT:
        this.shortExitCounter++;
        
        if (weight > this.catWeight * this.hesitationThreshold) {
          // Cat came back quickly - it was just a short exit (covering behavior)
          this.shortExits++;
          this.currentOccupancyStart = this.currentSample;  // Reset occupancy timer
          this.transitionTo(this.states.OCCUPIED, index);
        } else if (this.shortExitCounter > this.maxShortExitDuration) {
          // Been gone too long - this is a real exit
          this.exits++;
          return this.endSession();
        }
        // Otherwise, stay in SHORT_EXIT state and keep counting
        break;
        
      case this.states.EXITING:
        // Deprecated - using SHORT_EXIT instead
        break;
        
      case this.states.ENDED:
        // Session is over, ignore further samples until reset
        return this.getSessionSummary();
    }
    
    return {
      state: this.currentState,
      catWeight: this.catWeight,
      events: {
        entries: this.entries,
        exits: this.exits,
        hesitations: this.hesitations
      }
    };
  }
  
  private startSession(): void {
    this.sessionActive = true;
    this.sessionStartSample = this.currentSample;
    this.entries = 0;
    this.exits = 0;
    this.hesitations = 0;
    this.shortExits = 0;
    this.longestStableOccupancy = { duration: 0, weight: 0 };
  }
  
  private endSession(): StateResult {
    this.sessionActive = false;
    this.transitionTo(this.states.ENDED, this.currentSample);
    
    // Use the weight from the longest stable occupancy period
    if (this.longestStableOccupancy.weight > 0) {
      this.catWeight = this.longestStableOccupancy.weight;
    }
    
    return this.getSessionSummary();
  }
  
  private getSessionSummary(): StateResult {
    return {
      state: this.states.ENDED,
      catWeight: this.catWeight,
      events: {
        entries: this.entries,
        exits: this.exits,
        hesitations: this.hesitations
      }
    };
  }
  
  private updateCatWeight(): void {
    this.catWeight = Math.max(this.catWeight, this.getStableWeight());
  }
  
  private updateRunningStats(weight: number): void {
    // Initialize baseline from first few samples
    if (this.baselineWeight === 0 && this.stableWeightBuffer.length > 5) {
      this.baselineWeight = Math.min(...this.stableWeightBuffer);
    }
    
    // Maintain small circular buffer for efficiency
    if (this.stableWeightBuffer.length >= this.bufferSize) {
      this.stableWeightBuffer.shift();
    }
    this.stableWeightBuffer.push(weight);
    
    // Update running maximum with decay (to handle drift)
    this.runningMax = Math.max(this.runningMax * 0.9999, weight);
  }
  
  private isStable(): boolean {
    if (this.stableWeightBuffer.length < this.stabilityWindow) return false;
    
    const recent = this.stableWeightBuffer.slice(-this.stabilityWindow);
    const mean = recent.reduce((s, w) => s + w, 0) / recent.length;
    const maxDev = Math.max(...recent.map(w => Math.abs(w - mean)));
    
    return maxDev < 100; // Simple stability check
  }
  
  private getStableWeight(): number {
    const recent = this.stableWeightBuffer.slice(-this.stabilityWindow);
    return recent.reduce((s, w) => s + w, 0) / recent.length;
  }
  
  private transitionTo(newState: string, index: number): void {
    if (this.currentState !== newState) {
      this.phaseTransitions.push({
        from: this.currentState,
        to: newState,
        index: index,
        timestamp: this.currentPhaseStart
      });
      this.currentState = newState;
      this.currentPhaseStart = index;
    }
  }
  
  getCatWeight(): number {
    return this.catWeight;
  }
  
  getEvents(): { entries: number; exits: number; hesitations: number } {
    return {
      entries: this.entries,
      exits: this.exits,
      hesitations: this.hesitations
    };
  }
  
  reset(): void {
    // Call this to start processing a new event
    this.currentState = this.states.EMPTY;
    this.sessionActive = false;
    this.catWeight = 0;
    this.runningMax = 0;
    this.stableWeightBuffer = [];
    this.currentSample = 0;
    this.phaseTransitions = [];
    this.currentPhaseStart = 0;
  }
}

const extractPhasesFromStates = (stateTimeline: StateTimelineEntry[]): PhaseData => {
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

const detectPhasesWithEvents = (weights: number[]): PhaseDetectionResult => {
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

// Legacy phase detection (kept for backward compatibility if needed)
/*
const detectPhases = (weights: number[]): PhaseData => {
  const result = detectPhasesWithEvents(weights);
  return result.phases;
};
*/

// Helper functions for feature extraction
const calculateFilteredVariance = (signal: number[], outlierPercentile = 95): number => {
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
  
  return variance;
};

const calculateSpectralEntropy = (signal: number[]): number => {
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

const countPeaks = (signal: number[], prominence = 20): number => {
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
const extractFeatures = (weights: number[], sampleRate = 10): Features => {
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
  
  return features;
};

interface DecodedData {
  startTime: Date;
  measurements: { weight: number }[];
  context: {
    wasteWeight?: number;
    litterRemaining?: number;
    deepCleanTimer?: number;
    totalVisits?: number;
    daysSinceLitterReplaced?: number;
    hoursSinceLastScoop?: number;
  };
}

interface PhaseData {
  entry: number;
  stepIn: number;
  eliminationStart: number;
  eliminationEnd: number;
  stepOut: number;
  exit: number;
}

interface Features {
  preEliminationDuration: number;
  eliminationDuration: number;
  coveringDuration: number;
  totalDuration: number;
  wasteWeight: number;
  maxWeight: number;
  initialWeight: number;
  finalWeight: number;
  coveringVariance: number;
  coveringFluctuations: number;
  coveringSpectralEntropy: number;
  preEliminationVariance: number;
  eliminationRate: number;
  phases: PhaseData;
}

interface LitterboxAnalyzerProps {
  events: EventData[];
  className?: string;
}

const LitterboxAnalyzer = React.forwardRef<HTMLDivElement, LitterboxAnalyzerProps>(
  ({ events, className }, ref) => {
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [analysisData, setAnalysisData] = useState<{
    decodedData: DecodedData;
    features: Features;
  } | null>(null);
  const [error, setError] = useState<string>('');
  
  // Chart refs
  const weightChartRef = useRef<HTMLCanvasElement>(null);
  const analysisChartRef = useRef<HTMLCanvasElement>(null);
  const weightChartInstance = useRef<ChartJS | null>(null);
  const analysisChartInstance = useRef<ChartJS | null>(null);

  // Cleanup on unmount and when switching tabs
  useEffect(() => {
    return () => {
      if (weightChartInstance.current) {
        weightChartInstance.current.destroy();
        weightChartInstance.current = null;
      }
      if (analysisChartInstance.current) {
        analysisChartInstance.current.destroy();
        analysisChartInstance.current = null;
      }
    };
  }, []);

  // Function to destroy existing charts
  const destroyCharts = () => {
    if (weightChartInstance.current) {
      weightChartInstance.current.destroy();
      weightChartInstance.current = null;
    }
    if (analysisChartInstance.current) {
      analysisChartInstance.current.destroy();
      analysisChartInstance.current = null;
    }
  };

  // Function to create weight chart
  const createWeightChart = (data: DecodedData, features: Features) => {
    if (!weightChartRef.current) return;
    
    destroyCharts(); // Ensure clean slate
    
    const ctx = weightChartRef.current.getContext('2d');
    if (!ctx) return;

    const timeLabels = data.measurements.map((_, i) => (i / 10).toFixed(1));
    const weights = data.measurements.map(m => m.weight);
    const phases = features.phases;
    const eliminationType = String(getEventDataProp(selectedEvent?.data || {}, 'elimination_type') || 'unknown');

    // Get state timeline for annotations
    const result = detectPhasesWithEvents(weights);
    const stateTimeline = result.stateTimeline;
    
    // Create state region annotations
    const stateAnnotations: Record<string, {
      type: string;
      xMin: string;
      xMax: string;
      backgroundColor: string;
      borderColor: string;
      borderWidth: number;
      label: {
        enabled: boolean;
        content: string;
        position: string;
        font: { size: number };
        color: string;
      };
    }> = {};
    
    // Group consecutive states into regions
    let currentState = '';
    let stateStart = 0;
    let annotationIndex = 0;
    
    for (let i = 0; i < stateTimeline.length; i++) {
      const state = stateTimeline[i].state;
      
      if (state !== currentState) {
        // End previous state region
        if (currentState && i > stateStart) {
          const stateColors: Record<string, { bg: string; border: string }> = {
            'empty': { bg: 'rgba(158, 158, 158, 0.1)', border: 'rgba(158, 158, 158, 0.3)' },
            'entering': { bg: 'rgba(25, 118, 210, 0.1)', border: 'rgba(25, 118, 210, 0.3)' },
            'occupied': { bg: 'rgba(76, 175, 80, 0.1)', border: 'rgba(76, 175, 80, 0.3)' },
            'hesitating': { bg: 'rgba(255, 152, 0, 0.1)', border: 'rgba(255, 152, 0, 0.3)' },
            'short_exit': { bg: 'rgba(156, 39, 176, 0.1)', border: 'rgba(156, 39, 176, 0.3)' },
            'exiting': { bg: 'rgba(244, 67, 54, 0.1)', border: 'rgba(244, 67, 54, 0.3)' },
            'ended': { bg: 'rgba(96, 125, 139, 0.1)', border: 'rgba(96, 125, 139, 0.3)' }
          };
          
          const color = stateColors[currentState] || stateColors['empty'];
          
          stateAnnotations[`state_${annotationIndex}`] = {
            type: 'box',
            xMin: (stateStart / 10).toFixed(1),
            xMax: ((i - 1) / 10).toFixed(1),
            backgroundColor: color.bg,
            borderColor: color.border,
            borderWidth: 1,
            label: {
              enabled: true,
              content: currentState.toUpperCase(),
              position: 'center',
              font: {
                size: 10
              },
              color: color.border
            }
          };
          annotationIndex++;
        }
        
        currentState = state;
        stateStart = i;
      }
    }
    
    // Handle the last state
    if (currentState && stateTimeline.length > stateStart) {
      const stateColors: Record<string, { bg: string; border: string }> = {
        'empty': { bg: 'rgba(158, 158, 158, 0.1)', border: 'rgba(158, 158, 158, 0.3)' },
        'entering': { bg: 'rgba(25, 118, 210, 0.1)', border: 'rgba(25, 118, 210, 0.3)' },
        'occupied': { bg: 'rgba(76, 175, 80, 0.1)', border: 'rgba(76, 175, 80, 0.3)' },
        'hesitating': { bg: 'rgba(255, 152, 0, 0.1)', border: 'rgba(255, 152, 0, 0.3)' },
        'short_exit': { bg: 'rgba(156, 39, 176, 0.1)', border: 'rgba(156, 39, 176, 0.3)' },
        'exiting': { bg: 'rgba(244, 67, 54, 0.1)', border: 'rgba(244, 67, 54, 0.3)' },
        'ended': { bg: 'rgba(96, 125, 139, 0.1)', border: 'rgba(96, 125, 139, 0.3)' }
      };
      
      const color = stateColors[currentState] || stateColors['empty'];
      
      stateAnnotations[`state_${annotationIndex}`] = {
        type: 'box',
        xMin: (stateStart / 10).toFixed(1),
        xMax: ((stateTimeline.length - 1) / 10).toFixed(1),
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: 1,
        label: {
          enabled: true,
          content: currentState.toUpperCase(),
          position: 'center',
          font: {
            size: 10
          },
          color: color.border
        }
      };
    }

    weightChartInstance.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels: timeLabels,
        datasets: [
          {
            label: 'Weight (g)',
            data: weights,
            borderColor: eliminationType === 'defecation' ? '#d32f2f' : '#007AFF',
            backgroundColor: eliminationType === 'defecation' ? 'rgba(211, 47, 47, 0.1)' : 'rgba(0, 122, 255, 0.1)',
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 4,
            yAxisID: 'y',
            fill: false,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `Weight Over Time - ${String(getEventDataProp(selectedEvent?.data || {}, 'elimination_type') || 'Unknown')} Event (Enhanced State Machine)`
          },
          annotation: {
            annotations: {
              // State regions (drawn first, behind everything)
              ...stateAnnotations,
              // Phase boundary lines (drawn on top)
              // stepIn: {
              //   type: 'line',
              //   xMin: (phases.stepIn / 10).toFixed(1),
              //   xMax: (phases.stepIn / 10).toFixed(1),
              //   borderColor: '#1976d2',
              //   borderWidth: 2,
              //   label: {
              //     content: 'Step In',
              //     display: true,
              //     position: '75%'
              //   }
              // },
              // eliminationStart: {
              //   type: 'line',
              //   xMin: (phases.eliminationStart / 10).toFixed(1),
              //   xMax: (phases.eliminationStart / 10).toFixed(1),
              //   borderColor: '#f57c00',
              //   borderWidth: 2,
              //   label: {
              //     content: 'Elimination Start',
              //     display: true,
              //     position: '35%'
              //   }
              // },
              // eliminationEnd: {
              //   type: 'line',
              //   xMin: (phases.eliminationEnd / 10).toFixed(1),
              //   xMax: (phases.eliminationEnd / 10).toFixed(1),
              //   borderColor: '#7b1fa2',
              //   borderWidth: 2,
              //   label: {
              //     content: 'Elimination End',
              //     display: true,
              //     position: '55%'
              //   }
              // },
              // stepOut: {
              //   type: 'line',
              //   xMin: (phases.stepOut / 10).toFixed(1),
              //   xMax: (phases.stepOut / 10).toFixed(1),
              //   borderColor: '#388e3c',
              //   borderWidth: 2,
              //   label: {
              //     content: 'Step Out',
              //     display: true,
              //     position: '75%'
              //   }
              // }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time (seconds)'
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Weight (g)'
            }
          }
        }
      }
    });
  };

  // Function to create analysis chart
  const createAnalysisChart = (features: Features) => {
    if (!analysisChartRef.current) return;
    
    const ctx = analysisChartRef.current.getContext('2d');
    if (!ctx) return;

    analysisChartInstance.current = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels: ['Pre-elimination\n(seconds)', 'Elimination\n(seconds)', 'Covering\n(seconds)', 'Covering\nVariance', 'Waste\nWeight (g)'],
        datasets: [{
          label: 'Feature Values',
          data: [
            features.preEliminationDuration,
            features.eliminationDuration,
            features.coveringDuration,
            features.coveringVariance / 100, // Scale down for visualization
            features.wasteWeight
          ],
          backgroundColor: [
            'rgba(25, 118, 210, 0.7)',
            'rgba(245, 124, 0, 0.7)',
            'rgba(123, 31, 162, 0.7)',
            'rgba(255, 87, 34, 0.7)',
            'rgba(211, 47, 47, 0.7)'
          ],
          borderColor: [
            'rgb(25, 118, 210)',
            'rgb(245, 124, 0)',
            'rgb(123, 31, 162)',
            'rgb(255, 87, 34)',
            'rgb(211, 47, 47)'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Extracted Features'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  };

  const handleEventSelect = (event: EventData) => {
    try {
      if (!event.raw_data || event.raw_data.length === 0) {
        throw new Error('No raw data available for this event');
      }

      // Clear existing analysis first
      setAnalysisData(null);
      setSelectedEvent(null);
      destroyCharts();
      
      const decodedData = decodeRawData(event.raw_data);
      const weights = decodedData.measurements.map((m: { weight: number }) => m.weight);
      const features = extractFeatures(weights);

      setAnalysisData({ decodedData, features });
      setSelectedEvent(event);
      setError('');
      
      // Create charts after state is set
      setTimeout(() => {
        createWeightChart(decodedData, features);
        createAnalysisChart(features);
      }, 50);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setAnalysisData(null);
    }
  };

  // Get litterbox events with raw data
  const litterboxEvents = events.filter(event => 
    event.data && 
    typeof event.data === 'object' &&
    'type' in event.data &&
    event.data.type === 'litterbox_use' && 
    event.raw_data && 
    event.raw_data.length > 0
  );

  return (
    <div 
      className="litterbox-analyzer"
      ref={ref}
      {...(className && { className })}
    >
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}
      {litterboxEvents.length > 0 && (
        <div className="event-selector">
          <h3>📋 Select Event to Analyze</h3>
          <div className="event-list">
            {litterboxEvents.map((event) => {
              const eliminationType = String(getEventDataProp(event.data, 'elimination_type') || 'unknown');
              const weight = getEventDataProp(event.data, 'elimination_weight');
              const duration = getEventDataProp(event.data, 'duration');
              
              return (
                <div
                  key={event.id}
                  className={`event-card ${selectedEvent?.id === event.id ? 'selected' : ''}`}
                  onClick={() => handleEventSelect(event)}
                >
                  <div className="event-header">
                    <div className="event-type-icon">
                      {getEliminationIcon(eliminationType)}
                    </div>
                    <div className="event-details">
                      <div className="event-time">
                        <FaCalendarAlt className="time-icon" />
                        {new Date(event.timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      {event.human_verified && <FaCheck className="verified-icon" />}
                    </div>
                  </div>
                  <div className="event-metrics">
                    <span className="metric">
                      <FaWeight className="metric-icon" />
                      {String(weight || 'N/A')}g
                    </span>
                    <span className="metric">
                      <FaClock className="metric-icon" />
                      {typeof duration === 'number' ? `${(Number(duration) / 1000).toFixed(1)}s` : 'N/A'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysisData && selectedEvent && (
        <div className="analysis-results">
          <h2>📊 Event Visualization</h2>
          <div className="chart-container">
            <canvas ref={weightChartRef} />
          </div>

          {/* State Legend */}
          <div className="state-legend">
            <h4>State Machine Visualization:</h4>
            <div className="legend-items">
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: 'rgba(158, 158, 158, 0.3)' }}></span>
                <span>EMPTY - No cat present</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: 'rgba(25, 118, 210, 0.3)' }}></span>
                <span>ENTERING - Cat stepping on</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: 'rgba(76, 175, 80, 0.3)' }}></span>
                <span>OCCUPIED - Cat stable (elimination)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: 'rgba(255, 152, 0, 0.3)' }}></span>
                <span>HESITATING - Cat showing uncertainty</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: 'rgba(156, 39, 176, 0.3)' }}></span>
                <span>SHORT_EXIT - Brief exit (covering behavior)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: 'rgba(244, 67, 54, 0.3)' }}></span>
                <span>EXITING - Cat leaving</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: 'rgba(96, 125, 139, 0.3)' }}></span>
                <span>ENDED - Session completed</span>
              </div>
            </div>
          </div>

          {/* Phase Markers */}
          <div className="phase-markers">
            <h4>Detected Phases ({String(getEventDataProp(selectedEvent.data, 'elimination_type') || 'unknown')} - {selectedEvent.human_verified ? '✅ Human Verified' : '⚠️ Unverified'}) - Enhanced Session Analysis:</h4>
            <div className="phase-markers-grid">
              <span className="phase-marker phase-entry">Step In: {(analysisData.features.phases.stepIn/10).toFixed(1)}s</span>
              <span className="phase-marker phase-elimination">Pre: {((analysisData.features.phases.eliminationStart-analysisData.features.phases.stepIn)/10).toFixed(1)}s</span>
              <span className="phase-marker phase-elimination">Elimination: {((analysisData.features.phases.eliminationEnd-analysisData.features.phases.eliminationStart)/10).toFixed(1)}s</span>
              <span className="phase-marker phase-covering">Covering: {((analysisData.features.phases.stepOut-analysisData.features.phases.eliminationEnd)/10).toFixed(1)}s</span>
              <span className="phase-marker phase-exit">Step Out: {(analysisData.features.phases.stepOut/10).toFixed(1)}s</span>
            </div>
            <div className="metrics-row">
              <span className="metric">Total: <strong>{analysisData.features.totalDuration.toFixed(1)}s</strong></span>
              <span className="metric">Waste: <strong>{analysisData.features.wasteWeight.toFixed(1)}g</strong></span>
              <span className="metric">Rate: <strong>{analysisData.features.eliminationRate.toFixed(2)}g/s</strong></span>
              <span className="metric">Covering Activity: <strong>{analysisData.features.coveringFluctuations} peaks</strong></span>
              <span className="metric">Covering Variance: <strong>{analysisData.features.coveringVariance.toFixed(0)}</strong></span>
              <span className="metric">Pre-Elim Variance: <strong>{analysisData.features.preEliminationVariance.toFixed(0)}</strong></span>
              <span className="metric">Spectral Entropy: <strong>{analysisData.features.coveringSpectralEntropy.toFixed(3)}</strong></span>
              {(() => {
                const weights = analysisData.decodedData.measurements.map((m: { weight: number }) => m.weight);
                const eventResult = detectPhasesWithEvents(weights);
                return (
                  <>
                    <span className="metric">Entries: <strong>{eventResult.events.entries}</strong></span>
                    <span className="metric">Exits: <strong>{eventResult.events.exits}</strong></span>
                    <span className="metric">Hesitations: <strong>{eventResult.events.hesitations}</strong></span>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Features Summary */}
        </div>
      )}
    </div>
  );
});

LitterboxAnalyzer.displayName = "LitterboxAnalyzer";

export { type LitterboxAnalyzerProps };
export default LitterboxAnalyzer;
