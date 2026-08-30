import type {
  DeviceSignal,
  SignalSeverity,
  SignalTone,
  SignalValue,
} from '../schemas/api/deviceSignals.ts';

/**
 * Urgency scoring for device signals.
 *
 * A signal scores from its own counter: distance to threshold, days to due, or
 * offline duration. The devices grid gives the gauge to the highest-scoring
 * signal and the two meta lines to the next two.
 *
 * Lives in `shared` so providers do not each define their own thresholds, and
 * so notifications score a signal the way the card does.
 *
 * Thresholds read vendor-reported counters and user-set values only.
 * `waste_since_scoop` scores against `device.config.waste_threshold_g`; a
 * device without one reports its weight and takes no urgency band, since a
 * fixed scoop-now weight would be an uncited health band.
 *
 * Where a signal sits inside `calm` is a question of interest, not of alarm.
 * A counter that reads zero when there is nothing to report can hold most of
 * the calm range while still warning only at its own threshold, and it can do
 * that with no threshold configured at all: whether there is waste in the box
 * is knowable from the box alone, and only how much of it is too much needs a
 * number from its owner.
 */

export const DEVICE_SIGNAL_KEYS = {
  OFFLINE: 'offline',
  LAST_SEEN: 'last_seen',
  PUMP_FLOW: 'pump_flow',
  BOWL_MISSING: 'bowl_missing',
  WATER_LEVEL: 'water_level',
  WATER_FRESHNESS: 'water_freshness',
  FILTER_LIFE: 'filter_life',
  FEEDER_FILL: 'feeder_fill',
  LAST_REFRESHED: 'last_refreshed',
  BATTERY: 'battery',
  SIGNAL_STRENGTH: 'signal_strength',
  RECOGNITION: 'recognition',
  WASTE_SINCE_SCOOP: 'waste_since_scoop',
  LITTER_REMAINING: 'litter_remaining',
  DEEP_CLEAN: 'deep_clean',
  VISITS_SINCE_CLEAN: 'visits_since_clean',
  STORAGE: 'storage',
  RECORDING: 'recording',
} as const;

/** Urgency of an informational signal. Backfills a slot, never alarms. */
export const BACKFILL_URGENCY = 5;

/** Highest urgency a `calm` signal may reach, keeping calm below `soon`. */
const CALM_CEILING = 44;

/** Where an accumulation's calm band starts once anything is in it. */
const PRESENT_URGENCY = 36;

interface ScoreRule {
  /**
   * Which end of the scale is bad. `lower` for levels and countdowns, `higher`
   * for accumulations such as offline duration.
   */
  direction: 'lower' | 'higher';
  /** Crossing this puts the signal in `now`. */
  now: number;
  /** Crossing this puts the signal in `soon`. Omit for a fault flag. */
  soon?: number;
  nowScore: number;
  soonScore: number;
  /** Calm urgency is `base + slope * value`, clamped to [0, CALM_CEILING]. */
  calm: { base: number; slope: number };
  /**
   * Urgency when the counter reads zero, for an accumulation whose zero means
   * "nothing there". Such a counter starts its calm band near the top rather
   * than ramping into it from the bottom, and this is the reading carved out
   * of that: an empty box has nothing to say, and without the carve-out it
   * would say it loudly.
   */
  emptyScore?: number;
  /**
   * Urgency when the counter reads above zero but has no threshold to score
   * it against. Presence and severity are separate questions: the box weighs
   * what is in it on its own, and only "is that too much" waits on a number
   * its owner has to type. So an unconfigured box still ranks on the thing it
   * knows, and stays `calm` forever because the thing it does not know is
   * exactly the one that would raise a band.
   */
  presenceScore?: number;
}

const SCORE_TABLE: Record<string, ScoreRule> = {
  /* Outranks everything else: an unreachable device may have further faults
   * that are no longer being reported. */
  [DEVICE_SIGNAL_KEYS.OFFLINE]: {
    direction: 'higher',
    now: 24,
    soon: 1,
    nowScore: 100,
    soonScore: 70,
    calm: { base: 60, slope: 0 },
  },
  [DEVICE_SIGNAL_KEYS.PUMP_FLOW]: {
    direction: 'higher',
    now: 1,
    nowScore: 95,
    soonScore: 95,
    calm: { base: 5, slope: 0 },
  },
  /* Ranks above the level it explains: a bowl off the scale reports no level
   * at all, so this is the line that says why the gauge reads nothing. */
  [DEVICE_SIGNAL_KEYS.BOWL_MISSING]: {
    direction: 'higher',
    now: 1,
    nowScore: 92,
    soonScore: 92,
    calm: { base: 5, slope: 0 },
  },
  [DEVICE_SIGNAL_KEYS.WATER_LEVEL]: {
    direction: 'lower',
    now: 10,
    soon: 25,
    nowScore: 90,
    soonScore: 60,
    calm: { base: 40, slope: -0.3 },
  },
  [DEVICE_SIGNAL_KEYS.FILTER_LIFE]: {
    direction: 'lower',
    now: 0,
    soon: 3,
    nowScore: 88,
    soonScore: 58,
    calm: { base: 30, slope: -1 },
  },
  [DEVICE_SIGNAL_KEYS.FEEDER_FILL]: {
    direction: 'lower',
    now: 10,
    soon: 25,
    nowScore: 85,
    soonScore: 55,
    calm: { base: 35, slope: -0.3 },
  },
  [DEVICE_SIGNAL_KEYS.BATTERY]: {
    direction: 'lower',
    now: 10,
    soon: 20,
    nowScore: 82,
    soonScore: 52,
    calm: { base: 30, slope: -0.25 },
  },
  [DEVICE_SIGNAL_KEYS.STORAGE]: {
    direction: 'higher',
    now: 95,
    soon: 85,
    nowScore: 72,
    soonScore: 42,
    calm: { base: 8, slope: 0.3 },
  },
  /*
   * Severity is a ratio against the user's configured threshold.
   *
   * Its calm band starts high, just under `soon`: waste in the box is what
   * the box is for, and a single deposit is a thing its owner will deal with
   * today, while the counters around it — litter at half, a deep clean three
   * weeks out — are slow drains nobody acts on this morning. So anything in
   * the box leads the card well before there is enough to warn about, and the
   * ramp across the band still orders two dirty boxes by how dirty they are.
   */
  [DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP]: {
    direction: 'higher',
    now: 1,
    soon: 0.75,
    nowScore: 80,
    soonScore: 50,
    calm: { base: PRESENT_URGENCY, slope: 10 },
    emptyScore: 0,
    presenceScore: PRESENT_URGENCY,
  },
  /*
   * Percent of a full box rather than kilograms left, so one band fits every
   * box: a full load is whatever its owner pours in, and 1.5 kg is a
   * comfortable depth in one box and nearly bare in another. The percentage
   * exists only once that full weight is known, and until it is the provider
   * emits no litter signal at all.
   */
  [DEVICE_SIGNAL_KEYS.LITTER_REMAINING]: {
    direction: 'lower',
    now: 10,
    soon: 25,
    nowScore: 78,
    soonScore: 48,
    calm: { base: 28, slope: -0.28 },
  },
  [DEVICE_SIGNAL_KEYS.DEEP_CLEAN]: {
    direction: 'lower',
    now: 0,
    soon: 2,
    nowScore: 76,
    soonScore: 46,
    calm: { base: 26, slope: -1 },
  },
  /*
   * Severity is the fraction of the change interval still remaining, not a
   * day count: a 12-hour bowl cycle and a 5-day fountain cycle share one
   * urgency curve, and `soon` means the last fifth of whichever cycle.
   */
  [DEVICE_SIGNAL_KEYS.WATER_FRESHNESS]: {
    direction: 'lower',
    now: 0,
    soon: 0.2,
    nowScore: 75,
    soonScore: 55,
    calm: { base: 30, slope: -25 },
  },
};

export interface SignalScore {
  tone: SignalTone;
  urgency: number;
  /**
   * The table read this signal. An unscored one — a timestamp, a bare count —
   * only backfills a slot, and the card sorts it below anything the table
   * could read.
   */
  measured: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Position within a band, 0 at the near edge and 1 at the far side. Orders two
 * signals that resolve to the same tone.
 */
function bandDepth(
  value: number,
  edge: number,
  farSide: number,
  direction: ScoreRule['direction'],
): number {
  const span = Math.max(Math.abs(edge - farSide), 1);
  const distance = direction === 'lower' ? edge - value : value - edge;
  return clamp(distance / span, 0, 1);
}

/** Urgency added across the width of a band. */
const BAND_RAMP = 9;

const BACKFILL: SignalScore = {
  tone: 'calm',
  urgency: BACKFILL_URGENCY,
  measured: false,
};

/** A counter reporting something rather than nothing. */
function readsAboveZero(value?: SignalValue): boolean {
  if (value === undefined) return false;
  return (
    (value.kind === 'number' || value.kind === 'percent') && value.value > 0
  );
}

export function scoreDeviceSignal(signal: {
  key: string;
  value?: SignalValue;
  severity?: SignalSeverity;
}): SignalScore {
  const rule = SCORE_TABLE[signal.key];
  const severity = signal.severity;

  if (!rule) return BACKFILL;

  if (!severity) {
    /* Nothing to score the reading against, so no band — but an accumulation
     * that reads above zero has still told us the one thing that ranks it. */
    return rule.presenceScore !== undefined && readsAboveZero(signal.value)
      ? { tone: 'calm', urgency: rule.presenceScore, measured: true }
      : BACKFILL;
  }

  const { value } = severity;
  const { direction, now, soon, nowScore, soonScore, calm } = rule;
  const worseOrEqual = (threshold: number) =>
    direction === 'lower' ? value <= threshold : value >= threshold;

  if (worseOrEqual(now)) {
    /* A fault flag has no band width, so its depth collapses to zero. */
    const depth = bandDepth(value, now, soon ?? now, direction);
    return {
      tone: 'now',
      urgency: clamp(nowScore + depth * BAND_RAMP, 0, 100),
      measured: true,
    };
  }

  if (soon !== undefined && worseOrEqual(soon)) {
    const depth = bandDepth(value, soon, now, direction);
    return {
      tone: 'soon',
      urgency: clamp(soonScore + depth * BAND_RAMP, 0, 100),
      measured: true,
    };
  }

  if (rule.emptyScore !== undefined && value <= 0) {
    return { tone: 'calm', urgency: rule.emptyScore, measured: true };
  }

  return {
    tone: 'calm',
    urgency: clamp(calm.base + calm.slope * value, 0, CALM_CEILING),
    measured: true,
  };
}

/** The worst tone across a device's signals, or null when everything is calm. */
export function deviceAttentionTone(
  signals: readonly DeviceSignal[],
): Exclude<SignalTone, 'calm'> | null {
  let worst: Exclude<SignalTone, 'calm'> | null = null;
  for (const signal of signals) {
    const { tone } = scoreDeviceSignal(signal);
    if (tone === 'now') return 'now';
    if (tone === 'soon') worst = 'soon';
  }
  return worst;
}
