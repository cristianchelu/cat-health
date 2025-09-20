/** Describes a detected sub-event like an elimination. */
export interface SubEvent {
  type: 'ELIMINATION_URINATION' | 'ELIMINATION_DEFECATION' | 'PAUSE';
  startTs: number;
  endTs: number;
  durationS: number;
  stdDevDuring: number;
  weightGainG?: number; // Optional, as it may not apply to a 'PAUSE'
}

export type StateTransition = { from: string; to: string; index: number };
export type StatePeriod = {
  state: string;
  start: number;
  end: number;
  variance?: number;
};

/** The final, rich event object produced by the second pass analysis. */
export interface DetectedEvent {
  eventStartTs: number;
  eventEndTs: number;
  catProfile: {
    identifiedCatId: string | 'UNKNOWN';
    confidence: number;
  };
  mainPlateau: {
    startTs: number;
    endTs: number;
    durationS: number;
    meanWeightG: number;
    stdDevG: number;
  };
  subEvents: SubEvent[];
  rawData: number[];
}

/** Configuration for the LitterboxStateTracker. */
export interface TrackerConfig {
  catWeights: number[];

  // Phase 1: Real-time detection parameters
  risingEdgeThresholdG: number; // Min weight increase to signal start
  emptyBoxWeightThresholdG: number; // Max weight to be considered empty
  plateauWeightThresholdG: number; // Min weight to be considered an occupied plateau
  plateauStabilityStdDevThresholdG: number; // Max std dev for a stable plateau
  plateauMinDuration: number; // Min duration for a CANDIDATE to become IN_PLATEAU
  eventCooldownMs: number; // Time to wait after weight returns to baseline before finalizing event

  // Phase 2: Batch analysis parameters
  eliminationStabilityStdDevThresholdG: number; // Max std dev for an elimination event
  // eliminationWeightGainThresholdG: number; // Min weight gain to confirm elimination

  // Window Sizes (in samples)
  fastEmaSamples: number;
  slowEmaSamples: number;
  plateauSdvSamples: number;
  eliminationSdvSamples: number; // For second pass
}

/** A fixed-size circular buffer (ring buffer). */
export class Ring {
  private buffer: number[];
  private head: number = 0;
  private tail: number = 0;
  public isFull: boolean = false;
  public readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.buffer = new Array(size).fill(0);
  }

  /** Pushes a value, returning the value that was overwritten. */
  public push(value: number): number | undefined {
    const evicted = this.isFull ? this.buffer[this.head] : undefined;

    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.size;

    if (this.head === this.tail) {
      this.isFull = true;
    }

    return evicted;
  }

  /** Returns all values in the buffer. */
  public getValues(): number[] {
    if (!this.isFull) {
      return this.buffer.slice(0, this.head);
    }
    const reordered = [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ];
    return reordered;
  }

  public clear(): void {
    this.buffer.fill(0);
    this.head = 0;
    this.tail = 0;
    this.isFull = false;
  }
}

export class StreamingStandardDeviation {
  private ringBuffer: Ring;
  private sum: number = 0;
  private sumSq: number = 0;
  public readonly windowSize: number;

  constructor(windowSize: number) {
    this.windowSize = windowSize;
    this.ringBuffer = new Ring(windowSize);
  }

  public isReady(): boolean {
    return this.ringBuffer.isFull;
  }

  public update(value: number): number {
    const oldValue = this.ringBuffer.push(value);

    // Update sums in O(1)
    if (oldValue !== undefined) {
      this.sum += value - oldValue;
      this.sumSq += value * value - oldValue * oldValue;
    } else {
      this.sum += value;
      this.sumSq += value * value;
    }

    if (!this.isReady()) {
      return Infinity; // Not enough data yet
    }

    const mean = this.sum / this.windowSize;
    let variance = this.sumSq / this.windowSize - mean * mean;

    // Prevent negative variance due to floating point inaccuracies
    if (variance < 0) variance = 0;

    return Math.sqrt(variance);
  }

  public clear(): void {
    this.ringBuffer.clear();
    this.sum = 0;
    this.sumSq = 0;
  }
}

/** Calculates an Exponential Moving Average in a streaming fashion. */
export class ExponentialMovingAverage {
  private lastEma: number | null = null;
  public readonly alpha: number;

  constructor(alpha: number) {
    if (alpha <= 0 || alpha > 1) {
      throw new Error('Alpha must be between 0 and 1.');
    }
    this.alpha = alpha;
  }

  public update(value: number): number {
    if (this.lastEma === null) {
      this.lastEma = value;
    } else {
      this.lastEma = this.alpha * value + (1 - this.alpha) * this.lastEma;
    }
    return this.lastEma;
  }

  public clear() {
    this.lastEma = null;
  }
}

const State = {
  BASELINE: 'baseline', // Waiting for an event, weight is low and stable.
  ENTERING: 'entering', // Weight is increasing, cat is entering.
  PLATEAU_CANDIDATE: 'plateau_candidate', // Weight is high and stable, but not for long enough.
  OCCUPIED: 'occupied', // Confirmed stable plateau.
  COOLDOWN: 'cooldown', // Event finished, waiting briefly to ensure cat has fully left.
};
type State = (typeof State)[keyof typeof State];

export class LitterboxStateTracker2 {
  private currentState: State = State.BASELINE;
  private eventBuffer: number[] = [];

  // Real-time calculators
  private fastEma: ExponentialMovingAverage;
  private slowEma: ExponentialMovingAverage;
  private plateauSdv: StreamingStandardDeviation;
  private lastFastEma: number = 0;
  private lastSlowEma: number = 0;

  // State timers
  private plateauCandidateStartTime: number | null = null;
  private cooldownStartTime: number | null = null;

  private readonly config: TrackerConfig = {
    catWeights: [],
    risingEdgeThresholdG: 100,
    emptyBoxWeightThresholdG: 0,
    plateauWeightThresholdG: 2500,
    plateauStabilityStdDevThresholdG: 500,
    plateauMinDuration: 10,
    eventCooldownMs: 20,
    eliminationStabilityStdDevThresholdG: 4, // Max std dev for an elimination event
    fastEmaSamples: 10 * 1,
    slowEmaSamples: 10 * 2,
    plateauSdvSamples: 10 * 2,
    eliminationSdvSamples: 10 * 5, // For second pass
  };

  private transitions: StateTransition[] = [];

  constructor(weights: number[]) {
    this.fastEma = new ExponentialMovingAverage(
      2 / (this.config.fastEmaSamples + 1),
    );
    this.slowEma = new ExponentialMovingAverage(
      2 / (this.config.slowEmaSamples + 1),
    );
    this.plateauSdv = new StreamingStandardDeviation(
      this.config.plateauSdvSamples,
    );
    this.config.catWeights = weights;
  }

  /** Main entry point for new sensor data. */
  public processSample(value: number) {
    this.eventBuffer.push(value);

    // Update real-time calculators
    const currentFastEma = this.fastEma.update(value);
    const currentSlowEma = this.slowEma.update(value);
    const currentSdv = this.plateauSdv.update(value);

    const timestamp = this.eventBuffer.length;

    // --- State Machine Logic ---
    switch (this.currentState) {
      case State.BASELINE: {
        const isRising =
          currentFastEma > currentSlowEma &&
          this.lastFastEma <= this.lastSlowEma;
        if (isRising && value > this.config.risingEdgeThresholdG) {
          this.transitionTo(State.ENTERING);
        }

        // If in baseline after an event, check if cooldown is over
        if (
          this.cooldownStartTime &&
          timestamp - this.cooldownStartTime > this.config.eventCooldownMs
        ) {
          if (this.eventBuffer.length > 0) {
            // this._runSecondPassAnalysis();
          }
          this.reset();
        }
        break;
      }

      case State.ENTERING: {
        const isStable =
          currentSdv < this.config.plateauStabilityStdDevThresholdG;
        const isHighWeight = value > this.config.plateauWeightThresholdG;

        if (isStable && isHighWeight) {
          this.transitionTo(State.PLATEAU_CANDIDATE);
        } else if (value < this.config.emptyBoxWeightThresholdG) {
          this.transitionTo(State.COOLDOWN);
        }
        break;
      }

      case State.PLATEAU_CANDIDATE: {
        // This is the new, critical state logic.
        const isStillStable =
          currentSdv < this.config.plateauStabilityStdDevThresholdG;
        const isStillHighWeight = value > this.config.plateauWeightThresholdG;

        // First time entering this state, set the timer.
        if (this.plateauCandidateStartTime === null) {
          this.plateauCandidateStartTime = timestamp;
        }

        if (!isStillStable || !isStillHighWeight) {
          // Conditions broke during the candidacy. It was a fluke.
          this.transitionTo(State.ENTERING);
          this.plateauCandidateStartTime = null; // Reset timer
        } else if (
          timestamp - this.plateauCandidateStartTime >
          this.config.plateauMinDuration
        ) {
          // The candidate has proven itself. Promote to OCCUPIED.
          this.transitionTo(State.OCCUPIED);
          this.plateauCandidateStartTime = null; // Timer has served its purpose.
        }
        break;
      }

      case State.OCCUPIED: {
        const isStillStable =
          currentSdv < this.config.plateauStabilityStdDevThresholdG;
        const isStillHighWeight = value > this.config.plateauWeightThresholdG;

        if (!isStillStable || !isStillHighWeight) {
          // The plateau has ended. Go back to ENTERING to monitor movement, or COOLDOWN if weight drops.
          if (value < this.config.plateauWeightThresholdG) {
            this.transitionTo(State.COOLDOWN);
          } else {
            // Still high weight, but unstable (e.g., covering)
            this.transitionTo(State.ENTERING);
          }
        }
        // No more duration checks needed here. Once occupied, it's occupied until conditions break.
        break;
      }

      case State.COOLDOWN:
        if (value > this.config.risingEdgeThresholdG) {
          // Cat stepped back in, cancel cooldown
          this.transitionTo(State.ENTERING);
          this.cooldownStartTime = null;
        } else if (
          this.cooldownStartTime &&
          timestamp - this.cooldownStartTime > this.config.eventCooldownMs
        ) {
          // Cooldown finished, finalize and analyze
          //   this._runSecondPassAnalysis();
          this.reset();
        }
        break;
    }

    this.lastFastEma = currentFastEma;
    this.lastSlowEma = currentSlowEma;
  }

  public postProcessTransitions(): StatePeriod[] {
    if (!this.transitions.length) {
      return [];
    }

    const initialPeriods: StatePeriod[] = [];
    let currentState = this.transitions[0].from;
    let currentStart = 0;
    for (const transition of this.transitions) {
      if (transition.from !== currentState) {
        // This should not happen if transitions are well-formed
        console.warn('Unexpected transition sequence');
      }
      initialPeriods.push({
        state: currentState,
        start: currentStart,
        end: transition.index - 1,
      });
      currentState = transition.to;
      currentStart = transition.index;
    }
    // Add final period
    initialPeriods.push({
      state: currentState,
      start: currentStart,
      end: this.eventBuffer.length - 1,
    });

    return initialPeriods;
  }

  private transitionTo(newState: string): void {
    if (this.currentState !== newState) {
      this.transitions.push({
        from: this.currentState,
        to: newState,
        index: this.eventBuffer.length - 1,
      });
      this.currentState = newState;
    }
  }

  public getEvents() {
    return {
      entries: 0,
      exits: 0,
      hesitations: 0,
    };
  }

  public getCatWeight(): number {
    return 0;
  }

  public reset(): void {
    this.currentState = State.BASELINE;
    this.eventBuffer = [];
    this.plateauSdv.clear();
    this.fastEma.clear();
    this.slowEma.clear();
    this.plateauCandidateStartTime = null;
    this.cooldownStartTime = null;
    this.lastFastEma = 0;
    this.lastSlowEma = 0;
    this.transitions = [];
  }
}
