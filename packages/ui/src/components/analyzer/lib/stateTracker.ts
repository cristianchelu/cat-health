import type { StateResult, StateTransition } from '../types';

export class LitterboxStateTracker {
  private states = {
    EMPTY: 'empty',
    ENTERING: 'entering', 
    OCCUPIED: 'occupied',
    EXITING: 'exiting',
    HESITATING: 'hesitating',
    SHORT_EXIT: 'short_exit',
    ENDED: 'ended'
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
