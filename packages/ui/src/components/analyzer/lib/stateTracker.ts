class Ring {
  private buf: number[];
  private i = 0;
  private filled = 0;
  private n: number;
  constructor(n: number) { this.buf = new Array(n).fill(0); this.n = n; }
  push(x: number) { this.buf[this.i] = x; this.i = (this.i + 1) % this.n; this.filled = Math.min(this.filled + 1, this.n); }
  mean(): number { if (!this.filled) return 0; let s = 0; for (let k=0;k<this.filled;k++) s += this.buf[k]; return s/this.filled; }
  variance(): number {
    if (this.filled < 2) return 0;
    const m = this.mean();
    let s = 0;
    for (let k=0;k<this.filled;k++) { const d = this.buf[k]-m; s += d*d; }
    return s/(this.filled-1);
  }
  size() { return this.filled; }
}

// Optional shape you can import/merge with your types
type StateResult = {
  state: string;
  catWeight: number;
  events: { entries: number; exits: number; hesitations: number; shortExits?: number; eliminations?: number };
  // extras (optional)
  eliminationBouts?: Array<{ start: number; end: number }>;
  flags?: { suspectedStraining?: boolean };
};

type StateTransition = { from: string; to: string; index: number };

export class LitterboxStateTracker {
  private states = {
    EMPTY: 'empty',          // no presence
    ENTERING: 'entering',    // ramp up
    OCCUPIED: 'occupied',    // present + moving (digging/shifting)
    ELIMINATING: 'eliminating', // present + low variance plateau
    GAP: 'gap',              // short exit window (re-entry possible)
    ENDED: 'ended'
  };

  // Config (tune)
  private hz = 10;                      // samples per second
  private varStable = 200;              // variance threshold for "stable"
  private stableMin = 1 * this.hz;           // min samples for a stable bout (1s)
  private entryDeltaMin = 1200;         // grams, minimum rise to consider presence
  private entryDeltaFrac = 0.22;        // fraction of known cat weight to consider presence
  private presenceFrac = 0.28;          // fraction of cat weight regarded as "gone"
  private exitHold = 6;                  // samples below presence threshold to consider exit onset
  private reentryWindow = 15 * this.hz;      // samples allowed for re-entry (15s)
  private maxSession = 10 * 60 * this.hz;    // 10 minutes at 10Hz
  private minWasteDelta = 15;           // grams; if elimination bouts but < delta => suspected straining
  private emaBaselineAlpha = 0.02;      // EMA smoothing for baseline when empty/gap
  private knownPresenceTol = 0.10; // ±10% band for confirming presence


  private currentState = this.states.EMPTY;

  // Known weights (from history), injected in constructor
  private knownCatWeights: number[];

  // Running buffers
  private win1s = new Ring(10);         // 1s window at 10Hz
  private baseline = 0;                 // EMA baseline (tray + litter)
  private preSessionBaseline = 0;
  private postSessionBaseline = 0;

  // Presence and stability trackers
  private exitBelowCnt = 0;
  private gapCnt = 0;
  private stableCnt = 0;
  private presentConfirmed = false; // set true once weight sits near a known cat

  // Session
  private sessionActive = false;
  private sessionStartSample = 0;
  private currentSample = 0;

  // Counters
  private entries = 0;
  private exits = 0;
  private hesitations = 0;
  private shortExits = 0;

  // Elimination bouts
  private eliminationBouts: Array<{ start: number; end?: number }> = [];

  // Cat weight estimation
  private catWeight = 0;
  private bestStableWeight = 0;
  private bestStableDur = 0;

  // Transitions log (optional)
  private transitions: StateTransition[] = [];

  constructor(knownCatWeights?: number[]) {
    this.knownCatWeights = (knownCatWeights && knownCatWeights.length)
      ? knownCatWeights.slice().sort((a,b)=>a-b)
      : [];
  }

  // Main API
  processSample(weight: number, index: number): StateResult {
    this.currentSample = index;

    // Update windows
    this.win1s.push(weight);
    const mean1s = this.win1s.mean();
    const var1s = this.win1s.variance();
    const stableNow = (var1s > 0 && var1s < this.varStable);
    const rel = Math.max(0, mean1s - this.baseline);

    // Update baseline only when we think tray is empty or during gap and mean is near baseline
    if (this.currentState === this.states.EMPTY || this.currentState === this.states.GAP) {
      // Gentle EMA towards observed mean when it's not obviously a presence
      const closeToBaseline = Math.abs(mean1s - this.baseline) < 600;
      if (this.win1s.size() >= 5 && closeToBaseline) {
        this.baseline = this.baseline === 0 ? mean1s : (1 - this.emaBaselineAlpha) * this.baseline + this.emaBaselineAlpha * mean1s;
      }
    }

    // Session timeout
    if (this.sessionActive && (this.currentSample - this.sessionStartSample) > this.maxSession) {
      return this.endSession();
    }

    // Presence thresholds
    const entryDelta = this.entryThreshold();
    const presenceThreshold = this.catWeight > 0 ? this.catWeight * this.presenceFrac : entryDelta * 0.6;

    // State machine
    switch (this.currentState) {
      case this.states.EMPTY: {
        if (mean1s - this.baseline > entryDelta) {
          this.startSession();
          this.entries++;
          this.transitionTo(this.states.ENTERING);
        }
        break;
      }

      case this.states.ENTERING: {
        // Not “fully inside” yet
        if (!this.confirmPresence(rel)) {
          // Backed off toward baseline → hesitation, abort entry
          if (rel < 0.5 * this.entryThreshold()) {
            this.hesitations++;
            this.transitionTo(this.states.EMPTY);
          }
          // If presence is not confirmed, we stay in ENTERING and wait for more weight.
          break;
        }

        // Presence IS confirmed. Now, check for stability.
        if (stableNow) {
          this.stableCnt++;
          // Check if the stable duration threshold has been met.
          if (this.stableCnt >= this.stableMin) {
            if (this.nearKnownCatWeight(mean1s)) {
              this.onStablePlateau(mean1s, this.stableCnt);
              this.transitionTo(this.states.ELIMINATING);
              this.beginEliminationIfNeeded();
            } else {
              // The weight is stable but doesn't match a cat. Treat it as a generic occupation.
              this.transitionTo(this.states.OCCUPIED);
            }
          }
          // FIX #1: If stable but duration not met, do nothing.
          // By not transitioning, we IMPLICITLY stay in the ENTERING state
          // to continue incrementing stableCnt on the next tick.
        } else {
          // If not stable, the cat is moving around. Reset stability counter and go to OCCUPIED.
          this.stableCnt = 0;
          this.transitionTo(this.states.OCCUPIED);
        }
        break;
      }

      case this.states.OCCUPIED: {
        if (stableNow) {
          this.stableCnt++;
          if (this.stableCnt >= this.stableMin) {
            const plateau = mean1s;
            this.onStablePlateau(plateau, this.stableCnt);
            this.transitionTo(this.states.ELIMINATING);
            this.beginEliminationIfNeeded();
          }
        } else {
          this.stableCnt = 0;
        }

        // Exit detection
        if (this.catWeight > 0 && (this.catWeight - Math.max(mean1s - this.baseline, 0)) > presenceThreshold) {
          this.exitBelowCnt++;
          if (this.exitBelowCnt >= this.exitHold) {
            this.exitBelowCnt = 0;
            this.gapCnt = 0;
            this.exits++;
            this.transitionTo(this.states.GAP);
            this.endEliminationIfNeeded();
          }
        } else {
          this.exitBelowCnt = 0;
        }
        break;
      }

      case this.states.ELIMINATING: {
        // While stable => keep bout open and keep best estimate
        if (stableNow) {
          this.stableCnt++;
          const plateau = mean1s;
          this.onStablePlateau(plateau, this.stableCnt);
        } else {
          // End stable phase -> return to occupied
          this.stableCnt = 0;
          this.transitionTo(this.states.OCCUPIED);
          this.endEliminationIfNeeded();
        }

        // Exit while eliminating
        if (this.catWeight > 0 && (this.catWeight - Math.max(mean1s - this.baseline, 0)) > presenceThreshold) {
          this.exitBelowCnt++;
          if (this.exitBelowCnt >= this.exitHold) {
            this.exitBelowCnt = 0;
            this.gapCnt = 0;
            this.exits++;
            this.endEliminationIfNeeded();
            this.transitionTo(this.states.GAP);
          }
        } else {
          this.exitBelowCnt = 0;
        }
        break;
      }

      case this.states.GAP: {
        this.gapCnt++;

        // Re-entry within window: short exit (covering or hop out/in)
        if (mean1s - this.baseline > entryDelta) {
          this.entries++;
          this.shortExits++;
          // Consider whether it re-enters directly into eliminating or moving
          if (stableNow) {
            const plateau = mean1s;
            this.onStablePlateau(plateau, 1);
            this.transitionTo(this.states.ELIMINATING);
            this.beginEliminationIfNeeded();
          } else {
            this.transitionTo(this.states.OCCUPIED);
          }
        } else if (this.gapCnt > this.reentryWindow) {
          // No re-entry: end session
          return this.endSession();
        }
        break;
      }

      case this.states.ENDED: {
        return this.getSessionSummary();
      }
    }

    return this.getPartial();
  }

  // --- internals ---
  private getSessionSummary(): StateResult {
    // Normalize bouts and compute simple health flag
    const completedBouts = this.eliminationBouts
      .map(b => (b.end === undefined ? { start: b.start, end: this.currentSample } : { start: b.start, end: b.end }))
      .filter(b => b.end >= b.start);

    const stableBouts = completedBouts.filter(b => (b.end - b.start) >= this.stableMin);
    const postBase = this.postSessionBaseline || this.baseline;
    const wasteDelta = postBase - this.preSessionBaseline;
    const suspectedStraining = (stableBouts.length >= 2) && (wasteDelta < this.minWasteDelta);

    return {
      state: this.states.ENDED,
      catWeight: this.catWeight || this.bestStableWeight,
      events: {
        entries: this.entries,
        exits: this.exits,
        hesitations: this.hesitations,
        shortExits: this.shortExits,
        eliminations: completedBouts.length
      },
      eliminationBouts: completedBouts,
      flags: { suspectedStraining }
    };
  }
  private entryThreshold(): number {
    // Dynamic entry delta using known weights if available (20–30% of the smallest known)
    const minKnown = this.knownCatWeights.length ? this.knownCatWeights[0] : 0;
    const frac = minKnown ? Math.max(this.entryDeltaMin, minKnown * this.entryDeltaFrac) : this.entryDeltaMin;
    return frac;
  }

  private onStablePlateau(stableWeight: number, durationSamples: number): void {
    const rel = Math.max(0, stableWeight - this.baseline);

    if (durationSamples > this.bestStableDur) {
      this.bestStableDur = durationSamples;
      this.bestStableWeight = rel;
    }
    if (this.catWeight <= 0) this.catWeight = this.bestStableWeight;
    else this.catWeight = 0.9 * this.catWeight + 0.1 * this.bestStableWeight;
  }

  private beginEliminationIfNeeded(): void {
    const last = this.eliminationBouts[this.eliminationBouts.length - 1];
    if (!last || last.end !== undefined) {
      this.eliminationBouts.push({ start: this.currentSample });
    }
  }

  private endEliminationIfNeeded(): void {
    const last = this.eliminationBouts[this.eliminationBouts.length - 1];
    if (last && last.end === undefined) {
      last.end = this.currentSample;
    }
  }

  private startSession(): void {
    this.sessionActive = true;
    this.presentConfirmed = false;
    this.sessionStartSample = this.currentSample;
    this.preSessionBaseline = this.baseline;
    this.entries = 0;
    this.exits = 0;
    this.hesitations = 0;
    this.shortExits = 0;
    this.eliminationBouts = [];
    this.catWeight = 0;
    this.bestStableWeight = 0;
    this.bestStableDur = 0;
    this.exitBelowCnt = 0;
    this.gapCnt = 0;
    this.stableCnt = 0;
  }

  private endSession(): StateResult {
    this.sessionActive = false;
    this.transitionTo(this.states.ENDED);
    // Close any open bout
    this.endEliminationIfNeeded();

    // Final baseline: collect a small tail window after session end if you call process afterwards;
    // here we just use the latest EMA
    this.postSessionBaseline = this.baseline;

    const wasteDelta = this.postSessionBaseline - this.preSessionBaseline;
    const suspectedStraining = (this.eliminationBouts.filter(b => (b.end ?? b.start) - b.start >= this.stableMin).length >= 2) && (wasteDelta < this.minWasteDelta);

    return {
      state: this.states.ENDED,
      catWeight: this.catWeight || this.bestStableWeight,
      events: {
        entries: this.entries,
        exits: this.exits,
        hesitations: this.hesitations,
        shortExits: this.shortExits,
        eliminations: this.eliminationBouts.length
      },
      eliminationBouts: this.eliminationBouts.filter(b => b.end !== undefined) as Array<{start:number; end:number}>,
      flags: { suspectedStraining }
    };
  }

  private getPartial(): StateResult {
    return {
      state: this.currentState,
      catWeight: this.catWeight || this.bestStableWeight,
      events: {
        entries: this.entries,
        exits: this.exits,
        hesitations: this.hesitations,
        shortExits: this.shortExits,
        eliminations: this.eliminationBouts.length
      }
    };
  }

  private transitionTo(newState: string): void {
    if (this.currentState !== newState) {
      this.transitions.push({ from: this.currentState, to: newState, index: this.currentSample });
      this.currentState = newState;
    }
  }

  // Optional getters
  getCatWeight(): number { return this.catWeight || this.bestStableWeight; }
  getEvents(): { entries: number; exits: number; hesitations: number; shortExits: number; eliminations: number } {
    return { entries: this.entries, exits: this.exits, hesitations: this.hesitations, shortExits: this.shortExits, eliminations: this.eliminationBouts.length };
  }
  getTransitions(): StateTransition[] { return this.transitions.slice(); }

  private nearKnownCatWeight(delta: number, tolFrac = this.knownPresenceTol): boolean {
    if (!this.knownCatWeights.length) return false;
    for (let i = 0; i < this.knownCatWeights.length; i++) {
      const w = this.knownCatWeights[i];
      if (w > 0 && Math.abs(delta - w) / w <= tolFrac) return true;
    }
    return false;
  }

  private confirmPresence(rel: number): boolean {
    // Use known weights first; fall back to plain entry delta
    return this.nearKnownCatWeight(rel) || rel > this.entryThreshold();
  }

  reset(): void {
    this.currentState = this.states.EMPTY;
    this.sessionActive = false;
    this.win1s = new Ring(10);
    this.baseline = 0;
    this.preSessionBaseline = 0;
    this.postSessionBaseline = 0;
    this.entries = 0; this.exits = 0; this.hesitations = 0; this.shortExits = 0;
    this.eliminationBouts = [];
    this.catWeight = 0; this.bestStableWeight = 0; this.bestStableDur = 0;
    this.exitBelowCnt = 0; this.gapCnt = 0; this.stableCnt = 0;
    this.transitions = [];
  }
}