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
  catWeight: number; // stable ELIMINATING mean, 0 if never stable (trendline only)
  wasteWeight: number;
  periods: StatePeriod[];
  detectedCatIndex: number; // index into knownCatWeights, -1 = unknown
  catPresence: number[]; // per-cat sample counts in OCCUPIED+ELIMINATING
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

  private hz: number;
  private varStable = Math.sqrt(250);
  private stableMergeGap: number;
  private entryDeltaMin = 1200;
  private entryDeltaFrac = 0.22;
  private presenceFrac = 0.28;
  private exitHold = 6;
  private reentryWindow: number;
  private maxSession: number;
  private knownPresenceTol = 0.1;
  private windowSize: number;
  private minEliminationSamples: number;
  private rmsWindowSamples: number;

  private currentState = this.states.EMPTY;
  private knownCatWeights: number[];
  private window: Ring;
  private weightHistory: Ring;
  private meanHistory = new Ring(3);
  private exitBelowCnt = 0;
  private gapCnt = 0;
  private stableCnt = 0;
  private sessionActive = false;
  private sessionStartSample = 0;
  private currentSample = 0;
  private wasteWeight = 0;
  private catWeight = 0;
  private elimSum = 0;
  private elimCount = 0;
  private bestElimWeight = 0;
  private bestElimDur = 0;
  private catPresence: number[] = [];
  private transitions: StateTransition[] = [];

  /**
   * `hz` sizes every time-based tuning window (smoothing ring, merge gaps,
   * re-entry window, session cap, per-window RMS). Production passes each
   * visit's true measured rate (~6.6–7.3Hz, from `deriveLitterboxSampleRateHz`);
   * the default of 10 is the legacy assumption kept for synthetic 10Hz streams.
   *
   * `opts` exposes the classification-adjacent windows for tuning studies:
   * `minEliminationSeconds` demotes shorter eliminating periods to occupied;
   * `rmsWindowSamples` (default `round(hz)`) sizes the windows whose median
   * RMS becomes `period.variance` — the value the urination / defecation
   * threshold is compared against.
   *
   * Defaults re-tuned 2026-08-19 for true-hz operation (n=1818 fixture
   * sweep, `test/tuneTrueHzThresholds.ts`): demotion 8s (was an effective
   * ~6.85s: 50 samples believed to be 5s at 10Hz), threshold unchanged at
   * 4g. True-hz metrics vs the old hz=10 baseline: elim accuracy 0.9208
   * (tie), bout P/R/F1 0.930/0.992/0.960 vs 0.925/0.990/0.956.
   */
  constructor(
    knownCatWeights?: number[],
    hz = 10,
    opts?: { minEliminationSeconds?: number; rmsWindowSamples?: number },
  ) {
    this.hz = hz;
    this.stableMergeGap = 1.5 * hz;
    this.reentryWindow = 15 * hz;
    // Runaway guard only — NOT a clinical judgment; this number has been
    // teeter-tottered before, so the evidence is pinned here: a real cat sat
    // 50+ minutes during a UTI bout (recorded 2026-08), and 10 minutes
    // silently truncated analysis of exactly those visits (raw_data is never
    // capped — only what processSample looks at). 60 min matches the longest
    // sessions the activity sensor produces. Benchmark-gated on the n=1818
    // fixture set before/after; see analyzerSmoke MAX_SESSION test.
    this.maxSession = 60 * 60 * hz;
    this.windowSize = Math.max(2, Math.round(hz));
    this.minEliminationSamples = Math.round(
      (opts?.minEliminationSeconds ?? 8) * hz,
    );
    this.rmsWindowSamples = opts?.rmsWindowSamples ?? Math.max(1, Math.round(hz));
    this.window = new Ring(this.windowSize);
    this.weightHistory = new Ring(this.windowSize);
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
        const ciOccupied = this.closestKnownCat(mean1s);
        if (ciOccupied >= 0) this.catPresence[ciOccupied]++;
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
        const ciElim = this.closestKnownCat(mean1s);
        if (ciElim >= 0) this.catPresence[ciElim]++;
        if (stableNow) {
          this.stableCnt++;
          this.elimSum += mean1s;
          this.elimCount++;
          this.catWeight = this.elimSum / this.elimCount;
        } else {
          if (this.elimCount > this.bestElimDur) {
            this.bestElimDur = this.elimCount;
            this.bestElimWeight = this.elimSum / this.elimCount;
          }
          this.elimSum = 0;
          this.elimCount = 0;
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

  private closestKnownCat(val: number, tolFrac = this.knownPresenceTol): number {
    let best = -1;
    let minDiff = 1e9;
    for (let i = 0; i < this.knownCatWeights.length; i++) {
      const w = this.knownCatWeights[i];
      if (w > 0) {
        const diff = Math.abs(val - w);
        if (diff <= w * tolFrac && diff < minDiff) {
          minDiff = diff;
          best = i;
        }
      }
    }
    return best;
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

    const minEliminationDuration = this.minEliminationSamples;
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

    let bestW = this.bestElimWeight;
    if (this.elimCount > this.bestElimDur && this.elimCount > 0) {
      bestW = this.elimSum / this.elimCount;
    }

    let detectedCatIndex = -1;
    let bestCount = 0;
    for (let i = 0; i < this.catPresence.length; i++) {
      if (this.catPresence[i] > bestCount) {
        bestCount = this.catPresence[i];
        detectedCatIndex = i;
      }
    }

    return {
      state: this.states.ENDED,
      catWeight: bestW > 0 ? bestW : this.catWeight,
      wasteWeight: this.wasteWeight,
      periods: finalStatePeriods,
      detectedCatIndex,
      catPresence: [...this.catPresence],
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
      period.variance = eliminatingPeriodMotionMetric(
        periodWeights,
        this.rmsWindowSamples,
      );
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
    this.elimSum = 0;
    this.elimCount = 0;
    this.bestElimWeight = 0;
    this.bestElimDur = 0;
    this.catPresence = new Array(this.knownCatWeights.length).fill(0);
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
    this.window = new Ring(this.windowSize);
    this.weightHistory = new Ring(this.windowSize);
    this.catWeight = 0;
    this.elimSum = 0;
    this.elimCount = 0;
    this.bestElimWeight = 0;
    this.bestElimDur = 0;
    this.catPresence = new Array(this.knownCatWeights.length).fill(0);
    this.exitBelowCnt = 0;
    this.gapCnt = 0;
    this.stableCnt = 0;
    this.transitions = [];
    this.wasteWeight = 0;
  }
}

function rmsAroundMean(samples: number[]): number {
  if (samples.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  const mean = sum / samples.length;
  let sq = 0;
  for (let i = 0; i < samples.length; i++) {
    const d = samples[i] - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / samples.length);
}

/**
 * Robust per-second motion metric for an eliminating period.
 *
 * Splits the (already edge-trimmed) segment into hz-sized windows (~1s),
 * computes RMS-around-mean per full window, then returns the median.
 * This keeps a brief jolt from inflating the whole-segment RMS past the
 * urination/defecation threshold.
 *
 * Fallbacks:
 * - Fewer than 2 samples: undefined (period not usable).
 * - Fewer than 1 full window: single RMS over the available samples.
 */
export function eliminatingPeriodMotionMetric(
  samples: number[],
  hz: number,
): number | undefined {
  if (samples.length < 2) return undefined;
  const windowSize = Math.max(1, Math.round(hz));
  if (samples.length < windowSize) return rmsAroundMean(samples);

  const rmsValues: number[] = [];
  const windowCount = Math.floor(samples.length / windowSize);
  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSize;
    rmsValues.push(rmsAroundMean(samples.slice(start, start + windowSize)));
  }

  rmsValues.sort((a, b) => a - b);
  const mid = Math.floor(rmsValues.length / 2);
  return rmsValues.length % 2
    ? rmsValues[mid]
    : (rmsValues[mid - 1] + rmsValues[mid]) / 2;
}

export function determineEliminationType(
  periods: StatePeriod[],
  urinationVarianceThresholdG: number = URINATION_VARIANCE_THRESHOLD_G,
): LitterboxUseEliminationType {
  const eliminatingPeriods = periods.filter(
    (p) => p.state === 'eliminating' && p.variance !== undefined,
  );
  if (eliminatingPeriods.length === 0) {
    return 'no_elimination';
  }

  if (eliminatingPeriods.length === 1) {
    return (eliminatingPeriods[0].variance ?? 0) < urinationVarianceThresholdG
      ? 'urination'
      : 'defecation';
  }

  if (eliminatingPeriods.length === 2) {
    const [a, b] = eliminatingPeriods;
    const aIsUrination = (a.variance ?? 0) < urinationVarianceThresholdG;
    const bIsUrination = (b.variance ?? 0) < urinationVarianceThresholdG;
    if (aIsUrination !== bIsUrination) {
      return 'both';
    }
  }

  return 'unknown';
}
