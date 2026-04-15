import type { LitterboxUseEliminationType } from 'shared';

/** Urination vs defecation split from eliminating-period variance (server-only). */
export const URINATION_VARIANCE_THRESHOLD_G = 4;

// --- State analyzer (plateau detection for accurate cat weight and elimination type) ---

export interface StatePeriod {
  state: string;
  start: number;
  end: number;
  variance?: number;
}

export interface StateResult {
  state: string;
  catWeight: number;
  wasteWeight: number;
  periods: StatePeriod[];
}

export type StateTransition = { from: string; to: string; index: number };

export class Ring {
  private buf: number[];
  private i = 0;
  private filled = 0;
  private n: number;

  constructor(n: number) {
    this.buf = new Array(n).fill(0);
    this.n = n;
  }

  push(x: number): void {
    this.buf[this.i] = x;
    this.i = (this.i + 1) % this.n;
    this.filled = Math.min(this.filled + 1, this.n);
  }

  mean(): number {
    if (!this.filled) return 0;
    let s = 0;
    for (let k = 0; k < this.filled; k++) s += this.buf[k];
    return s / this.filled;
  }

  variance(): number {
    if (this.filled < 2) return 0;
    const m = this.mean();
    let s = 0;
    for (let k = 0; k < this.filled; k++) {
      const d = this.buf[k] - m;
      s += d * d;
    }
    return s / (this.filled - 1);
  }

  every(fn: (v: number) => boolean): boolean {
    return this.buf.every(fn);
  }

  first(): number | undefined {
    return this.filled ? this.buf[0] : undefined;
  }

  last(): number | undefined {
    return this.filled ? this.buf[(this.i + this.n - 1) % this.n] : undefined;
  }

  size(): number {
    return this.filled;
  }

  toArray(): number[] {
    const result: number[] = [];
    for (let k = 0; k < this.filled; k++) {
      result.push(this.buf[k]);
    }
    return result;
  }
}

export class StateAnalyzer {
  private states = {
    EMPTY: 'empty',
    ENTERING: 'entering',
    OCCUPIED: 'occupied',
    ELIMINATING: 'eliminating',
    GAP: 'gap',
    ENDED: 'ended',
  };

  private hz = 10;
  private varStable = Math.sqrt(250);
  private stableMergeGap = 1.5 * this.hz;
  private entryDeltaMin = 1200;
  private entryDeltaFrac = 0.22;
  private presenceFrac = 0.28;
  private exitHold = 6;
  private reentryWindow = 15 * this.hz;
  private maxSession = 10 * 60 * this.hz;
  private knownPresenceTol = 0.1;
  private windowSize = 10;

  private currentState = this.states.EMPTY;
  private knownCatWeights: number[];
  private window = new Ring(this.windowSize);
  private weightHistory = new Ring(this.windowSize);
  private meanHistory = new Ring(3);
  private exitBelowCnt = 0;
  private gapCnt = 0;
  private stableCnt = 0;
  private sessionActive = false;
  private sessionStartSample = 0;
  private currentSample = 0;
  private wasteWeight = 0;
  private catWeight = 0;
  private bestStableWeight = 0;
  private bestStableDur = 0;
  private transitions: StateTransition[] = [];

  constructor(knownCatWeights?: number[]) {
    this.knownCatWeights =
      knownCatWeights && knownCatWeights.length
        ? knownCatWeights.slice().sort((a, b) => a - b)
        : [];
  }

  processSample(weight: number, index: number): void {
    if (
      this.sessionActive &&
      index - this.sessionStartSample > this.maxSession
    ) {
      return;
    }
    this.currentSample = index;
    this.window.push(weight);
    this.weightHistory.push(weight);
    const mean1s = this.window.mean();
    this.meanHistory.push(mean1s);
    const var10sample = Math.sqrt(this.weightHistory.variance());
    const stableNow = var10sample > 0 && var10sample < this.varStable;

    const entryDelta = this.entryThreshold();
    const presenceThreshold =
      this.catWeight > 0 ? this.catWeight * this.presenceFrac : entryDelta;

    switch (this.currentState) {
      case this.states.EMPTY: {
        if (mean1s > entryDelta) {
          this.startSession();
          this.transitionTo(this.states.ENTERING);
        }
        break;
      }
      case this.states.ENTERING: {
        if (!this.confirmPresence(mean1s)) {
          if (mean1s < 0.5 * this.entryThreshold()) {
            this.transitionTo(this.states.GAP, this.windowSize / 2);
          }
          break;
        }
        if (
          this.meanHistory.variance() < 10 &&
          this.meanHistory.every((m) => this.nearKnownCatWeight(m))
        ) {
          this.transitionTo(this.states.OCCUPIED, this.windowSize / 2);
        } else {
          this.stableCnt = 0;
        }
        break;
      }
      case this.states.OCCUPIED: {
        if (stableNow) {
          if (this.nearKnownCatWeight(mean1s)) {
            this.transitionTo(this.states.ELIMINATING);
          }
        }
        if (weight < entryDelta) {
          this.transitionTo(this.states.GAP, this.windowSize);
          this.exitBelowCnt = 0;
          break;
        }
        if (
          this.catWeight > 0 &&
          this.catWeight - mean1s > presenceThreshold
        ) {
          this.exitBelowCnt++;
          if (this.exitBelowCnt >= this.exitHold) {
            this.exitBelowCnt = 0;
            this.gapCnt = 0;
            this.transitionTo(this.states.ENTERING, this.windowSize);
          }
        } else {
          this.exitBelowCnt = 0;
        }
        break;
      }
      case this.states.ELIMINATING: {
        if (stableNow) {
          this.stableCnt++;
        } else {
          this.updateCatWeightEstimate(mean1s, this.stableCnt);
          this.stableCnt = 0;
          this.transitionTo(this.states.OCCUPIED);
        }
        if (
          this.catWeight > 0 &&
          this.catWeight - mean1s > presenceThreshold
        ) {
          this.exitBelowCnt++;
          if (this.exitBelowCnt >= this.exitHold) {
            this.exitBelowCnt = 0;
            this.gapCnt = 0;
            this.transitionTo(this.states.GAP);
          }
        } else {
          this.exitBelowCnt = 0;
        }
        break;
      }
      case this.states.GAP: {
        this.gapCnt++;
        if (mean1s > entryDelta) {
          if (stableNow) {
            if (this.nearKnownCatWeight(mean1s)) {
              this.transitionTo(this.states.ELIMINATING);
            }
          } else {
            this.transitionTo(this.states.ENTERING);
          }
        } else if (this.gapCnt > this.reentryWindow) {
          this.wasteWeight = weight;
          return;
        }
        break;
      }
      case this.states.ENDED: {
        return;
      }
    }
  }

  private updateCatWeightEstimate(
    stableWeight: number,
    durationSamples: number,
  ): void {
    if (durationSamples > this.bestStableDur) {
      this.bestStableDur = durationSamples;
      this.bestStableWeight = stableWeight;
    }
    if (this.catWeight <= 0) this.catWeight = this.bestStableWeight;
    else this.catWeight = 0.9 * this.catWeight + 0.1 * this.bestStableWeight;
  }

  private postProcessTransitions(): StatePeriod[] {
    if (!this.transitions.length) return [];

    let initialPeriods: StatePeriod[] = [];
    for (let i = 0; i < this.transitions.length; i++) {
      const currentTransition = this.transitions[i];
      const start =
        i === 0 ? this.sessionStartSample : currentTransition.index;
      const end = this.transitions[i + 1]
        ? this.transitions[i + 1].index
        : this.currentSample;
      initialPeriods.push({ state: currentTransition.to, start, end });
    }

    initialPeriods = initialPeriods.filter(
      (p) => p.state !== this.states.EMPTY && p.end > p.start,
    );

    for (let i = 1; i < initialPeriods.length - 1; i++) {
      const prev = initialPeriods[i - 1];
      const curr = initialPeriods[i];
      const next = initialPeriods[i + 1];
      if (
        prev.state === this.states.ELIMINATING &&
        curr.state === this.states.OCCUPIED &&
        next.state === this.states.ELIMINATING &&
        curr.end - curr.start < this.stableMergeGap &&
        prev.end - prev.start > 1 * this.hz &&
        next.end - next.start > 1 * this.hz
      ) {
        prev.end = next.end;
        initialPeriods.splice(i, 2);
        i--;
      }
    }

    const minEliminationDuration = 5 * this.hz;
    initialPeriods.forEach((p) => {
      if (
        p.state === this.states.ELIMINATING &&
        p.end - p.start < minEliminationDuration
      ) {
        p.state = this.states.OCCUPIED;
      }
    });

    if (initialPeriods.length === 0) return [];

    const mergedPeriods: StatePeriod[] = [{ ...initialPeriods[0] }];
    for (let i = 1; i < initialPeriods.length; i++) {
      const currentPeriod = initialPeriods[i];
      const lastMergedPeriod = mergedPeriods[mergedPeriods.length - 1];
      if (currentPeriod.state === lastMergedPeriod.state) {
        lastMergedPeriod.end = currentPeriod.end;
      } else {
        mergedPeriods.push({ ...currentPeriod });
      }
    }
    return mergedPeriods;
  }

  private getSessionSummary(): StateResult {
    const finalStatePeriods = this.postProcessTransitions();
    return {
      state: this.states.ENDED,
      catWeight: this.catWeight || this.bestStableWeight,
      wasteWeight: this.wasteWeight,
      periods: finalStatePeriods,
    };
  }

  processEvent(weights: number[]): StateResult {
    this.reset();
    for (let i = 0; i < weights.length; i++) {
      this.processSample(weights[i], i);
    }
    const result = this.getSessionSummary();
    result.periods.forEach((period) => {
      const buffer = 10;
      const periodWeights = weights.slice(
        period.start + buffer,
        period.end + 1 - buffer,
      );
      if (periodWeights.length < 2) {
        period.variance = undefined;
        return;
      }
      const mean =
        periodWeights.reduce((sum, w) => sum + w, 0) / periodWeights.length;
      const variance =
        periodWeights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) /
        periodWeights.length;
      period.variance = Math.sqrt(variance);
    });
    return result;
  }

  private entryThreshold(): number {
    const minKnown = this.knownCatWeights.length
      ? this.knownCatWeights[0]
      : 0;
    const frac = minKnown
      ? Math.max(this.entryDeltaMin, minKnown * this.entryDeltaFrac)
      : this.entryDeltaMin;
    return frac;
  }

  private startSession(): void {
    this.sessionActive = true;
    this.sessionStartSample = this.currentSample;
    this.catWeight = 0;
    this.bestStableWeight = 0;
    this.bestStableDur = 0;
    this.exitBelowCnt = 0;
    this.gapCnt = 0;
    this.stableCnt = 0;
    this.transitions = [];
  }

  private transitionTo(newState: string, offset?: number): void {
    if (this.currentState !== newState) {
      if (this.sessionActive && newState === this.states.EMPTY) {
        this.currentState = newState;
        this.endSession();
        return;
      }
      this.transitions.push({
        from: this.currentState,
        to: newState,
        index: this.currentSample - (offset || 0),
      });
      this.currentState = newState;
    }
  }

  private nearKnownCatWeight(
    delta: number,
    tolFrac = this.knownPresenceTol,
  ): boolean {
    if (!this.knownCatWeights.length) return false;
    for (let i = 0; i < this.knownCatWeights.length; i++) {
      const w = this.knownCatWeights[i];
      if (w > 0 && Math.abs(delta - w) / w <= tolFrac) return true;
    }
    return false;
  }

  private confirmPresence(rel: number): boolean {
    return this.nearKnownCatWeight(rel) || rel > this.entryThreshold();
  }

  private endSession(): StateResult {
    this.sessionActive = false;
    this.transitionTo(this.states.ENDED);
    return this.getSessionSummary();
  }

  reset(): void {
    this.currentState = this.states.EMPTY;
    this.sessionActive = false;
    this.window = new Ring(10);
    this.weightHistory = new Ring(10);
    this.catWeight = 0;
    this.bestStableWeight = 0;
    this.bestStableDur = 0;
    this.exitBelowCnt = 0;
    this.gapCnt = 0;
    this.stableCnt = 0;
    this.transitions = [];
    this.wasteWeight = 0;
  }
}

export function determineEliminationType(
  periods: StatePeriod[],
): LitterboxUseEliminationType {
  const eliminatingPeriods = periods.filter(
    (p) => p.state === 'eliminating' && p.variance !== undefined,
  );
  if (eliminatingPeriods.length === 0) {
    return 'no_elimination';
  }

  if (eliminatingPeriods.length === 1) {
    return (eliminatingPeriods[0].variance ?? 0) < URINATION_VARIANCE_THRESHOLD_G
      ? 'urination'
      : 'defecation';
  }

  if (eliminatingPeriods.length === 2) {
    const [a, b] = eliminatingPeriods;
    const aIsUrination = (a.variance ?? 0) < URINATION_VARIANCE_THRESHOLD_G;
    const bIsUrination = (b.variance ?? 0) < URINATION_VARIANCE_THRESHOLD_G;
    if (aIsUrination !== bIsUrination) {
      return 'both';
    }
  }

  return 'unknown';
}
