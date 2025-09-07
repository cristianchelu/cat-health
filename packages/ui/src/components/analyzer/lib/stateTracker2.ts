/** Profile for a known cat. */
export interface CatProfile {
  id: string;
  expectedWeight: number; // in grams
  tolerance: number; // in grams
}

/** Describes a detected sub-event like an elimination. */
export interface SubEvent {
  type: "ELIMINATION_URINATION" | "ELIMINATION_DEFECATION" | "PAUSE";
  startTs: number;
  endTs: number;
  durationS: number;
  stdDevDuring: number;
  weightGainG?: number; // Optional, as it may not apply to a 'PAUSE'
}

/** The final, rich event object produced by the second pass analysis. */
export interface DetectedEvent {
  eventStartTs: number;
  eventEndTs: number;
  catProfile: {
    identifiedCatId: string | "UNKNOWN";
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
  catProfiles: CatProfile[];

  // Phase 1: Real-time detection parameters
  risingEdgeThresholdG: number; // Min weight increase to signal start
  emptyBoxWeightThresholdG: number; // Max weight to be considered empty
  plateauWeightThresholdG: number; // Min weight to be considered an occupied plateau
  plateauStabilityStdDevThresholdG: number; // Max std dev for a stable plateau
  plateauMinDurationMs: number; // Min duration for a CANDIDATE to become IN_PLATEAU
  eventCooldownMs: number; // Time to wait after weight returns to baseline before finalizing event

  // Phase 2: Batch analysis parameters
  eliminationStabilityStdDevThresholdG: number; // Max std dev for an elimination event
  eliminationWeightGainThresholdG: number; // Min weight gain to confirm elimination

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
      throw new Error("Alpha must be between 0 and 1.");
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
  BASELINE: "BASELINE", // Waiting for an event, weight is low and stable.
  RISING_EDGE: "RISING_EDGE", // Weight is increasing, cat is entering.
  PLATEAU_CANDIDATE: "PLATEAU_CANDIDATE", // Weight is high and stable, but not for long enough.
  IN_PLATEAU: "IN_PLATEAU", // Confirmed stable plateau.
  COOLDOWN: "COOLDOWN", // Event finished, waiting briefly to ensure cat has fully left.
};
type State = (typeof State)[keyof typeof State];

export class LitterboxStateTracker {
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

  private readonly config: TrackerConfig;

  constructor(config: TrackerConfig) {
    this.fastEma = new ExponentialMovingAverage(
      2 / (config.fastEmaSamples + 1)
    );
    this.slowEma = new ExponentialMovingAverage(
      2 / (config.slowEmaSamples + 1)
    );
    this.plateauSdv = new StreamingStandardDeviation(config.plateauSdvSamples);
    this.config = config;
  }

  /** Main entry point for new sensor data. */
  public addDatapoint(value: number) {
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
          this.currentState = State.RISING_EDGE;
          this.cooldownStartTime = null; // Cancel any pending cooldown
        }
        // If in baseline after an event, check if cooldown is over
        if (
          this.cooldownStartTime &&
          timestamp - this.cooldownStartTime > this.config.eventCooldownMs
        ) {
          if (this.eventBuffer.length > 0) {
            // this._runSecondPassAnalysis();
          }
          this._reset();
        }
        break;
      }

      case State.RISING_EDGE:
      case State.IN_PLATEAU: {
        this.eventBuffer.push(value);
        const isStable =
          currentSdv < this.config.plateauStabilityStdDevThresholdG;
        const isHighWeight = value > this.config.plateauWeightThresholdG;

        if (isStable && isHighWeight) {
          this.currentState = State.PLATEAU_CANDIDATE;
          this.plateauCandidateStartTime = timestamp;
        } else if (value < this.config.emptyBoxWeightThresholdG) {
          this.currentState = State.COOLDOWN;
          this.cooldownStartTime = timestamp;
        }
        break;
      }

      case State.PLATEAU_CANDIDATE: {
        const isStillStable =
          currentSdv < this.config.plateauStabilityStdDevThresholdG;
        const isStillHighWeight = value > this.config.plateauWeightThresholdG;

        if (isStillStable && isStillHighWeight) {
          if (
            this.plateauCandidateStartTime &&
            timestamp - this.plateauCandidateStartTime >
              this.config.plateauMinDurationMs
          ) {
            this.currentState = State.IN_PLATEAU;
            this.plateauCandidateStartTime = null;
          }
        } else {
          // Stability broke, go back to looking for a plateau
          this.currentState = State.RISING_EDGE;
          this.plateauCandidateStartTime = null;
        }
        break;
        }

      case State.COOLDOWN:
        if (value > this.config.risingEdgeThresholdG) {
          // Cat stepped back in, cancel cooldown
          this.currentState = State.RISING_EDGE;
          this.cooldownStartTime = null;
        } else if (
          this.cooldownStartTime &&
          timestamp - this.cooldownStartTime > this.config.eventCooldownMs
        ) {
          // Cooldown finished, finalize and analyze
        //   this._runSecondPassAnalysis();
          this._reset();
        }
        break;
    }

    this.lastFastEma = currentFastEma;
    this.lastSlowEma = currentSlowEma;
  }

  private _reset(): void {
    this.currentState = State.BASELINE;
    this.eventBuffer = [];
    this.plateauSdv.clear();
    this.fastEma.clear();
    this.slowEma.clear();
    this.plateauCandidateStartTime = null;
    this.cooldownStartTime = null;
    this.lastFastEma = 0;
    this.lastSlowEma = 0;
  }
}
