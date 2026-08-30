import {
  DEVICE_SIGNAL_KEYS,
  scoreDeviceSignal,
  type DeviceSignal,
  type SignalTone,
} from 'shared';

/**
 * The device card's priority queue.
 *
 * A card has one gauge and two meta lines regardless of how many counters a
 * device exposes. The highest-scoring signal takes the gauge and the next two
 * take the meta lines, so a slot always holds the most useful thing that device
 * currently has to say. A signal shown in the gauge never repeats in meta.
 *
 * An unclaimed meta line stays empty. A calm diagnostic could fill it, but it
 * already has a glyph in the drawer a few pixels away, and a card stating the
 * same reading twice reads as a fault rather than as detail.
 */

const TONE_RANK: Record<SignalTone, number> = { calm: 0, soon: 1, now: 2 };

const META_SLOTS = 2;

const RANKABLE = new Set(['primary', 'drawer_ranked']);
const DRAWER = new Set(['drawer', 'drawer_ranked']);

export interface RankedSignal {
  signal: DeviceSignal;
  tone: SignalTone;
  urgency: number;
  /** The scoring table read this signal, rather than backfilling a slot. */
  measured: boolean;
}

export interface DeviceSlots {
  gauge: RankedSignal | null;
  meta: RankedSignal[];
  drawer: DeviceSignal[];
  /** Worst tone on the device, and what the attention triangle reads. */
  attention: Exclude<SignalTone, 'calm'> | null;
  /**
   * The device is unreachable, so its readings are last-known rather than
   * current. The gauge renders an empty track and no value.
   */
  stale: boolean;
}

/**
 * Tone, then whether the signal measures anything, then urgency.
 *
 * Bands overlap once the within-band ramp is applied — a signal deep into
 * `soon` can outscore one that has just entered `now` — and a `now` must always
 * sort above a `soon` whatever the arithmetic says.
 *
 * Measurements outrank the rest regardless of score. A calm reading and a
 * "last updated" both land near the bottom of the scale, and a card whose
 * headline is the time we last spoke to a feeder rather than how much food is
 * in it has answered the wrong question. What counts as a measurement is the
 * scoring table's call, not a test for a configured threshold: a box weighing
 * its waste with no scoop-now weight set is still measuring, and reading that
 * as "not a measurement" buried the one row worth looking at.
 *
 * Declaration order settles the rest, so equal signals keep a stable slot.
 */
function compareRanked(a: RankedSignal, b: RankedSignal): number {
  const byTone = TONE_RANK[b.tone] - TONE_RANK[a.tone];
  if (byTone !== 0) return byTone;

  const byMeasurement = Number(b.measured) - Number(a.measured);
  if (byMeasurement !== 0) return byMeasurement;

  return b.urgency - a.urgency;
}

/**
 * Diagnostics earn a slot only when something is wrong with them.
 *
 * A healthy battery is already drawn in the status drawer, so promoting it into
 * the card's headline says nothing new and pushes out what the device is
 * actually for. A failing one is worth a line.
 */
function competesForSlot(signal: DeviceSignal, tone: SignalTone): boolean {
  if (signal.category !== 'drawer_ranked') return true;
  return tone !== 'calm';
}

export function rankDeviceSignals(
  signals: readonly DeviceSignal[] = [],
): DeviceSlots {
  const drawer = signals.filter((signal) => DRAWER.has(signal.category));

  const ranked = signals
    .filter((signal) => RANKABLE.has(signal.category))
    .map((signal) => {
      const { tone, urgency, measured } = scoreDeviceSignal(signal);
      return { signal, tone, urgency, measured };
    })
    .filter((entry) => competesForSlot(entry.signal, entry.tone))
    .sort(compareRanked);

  const attention = ranked.some((entry) => entry.tone === 'now')
    ? 'now'
    : ranked.some((entry) => entry.tone === 'soon')
      ? 'soon'
      : null;

  /*
   * Offline is pinned to the first meta line rather than taking the gauge. The
   * gauge still names the device's own top metric, which reads as "we cannot
   * tell you this any more" — more informative than a gauge labelled "Offline".
   */
  const offline = ranked.find(
    (entry) => entry.signal.key === DEVICE_SIGNAL_KEYS.OFFLINE,
  );
  const rest = offline ? ranked.filter((entry) => entry !== offline) : ranked;

  const gauge = rest[0] ?? null;
  const remaining = rest.slice(1);
  const meta = (offline ? [offline, ...remaining] : remaining).slice(
    0,
    META_SLOTS,
  );

  return {
    gauge,
    meta,
    drawer,
    attention,
    stale: offline !== undefined,
  };
}

/**
 * A signature that changes only when slot assignment could change.
 *
 * Readings update continuously, and re-ranking on every one would let two
 * close signals swap the gauge back and forth while a user is looking at it.
 * Bucketing urgency holds the assignment steady until a signal meaningfully
 * moves, changes tone, or appears or disappears.
 */
export function deviceSlotSignature(
  signals: readonly DeviceSignal[] = [],
): string {
  return signals
    .map((signal) => {
      const { tone, urgency } = scoreDeviceSignal(signal);
      return `${signal.key}:${tone}:${Math.round(urgency / 5)}`;
    })
    .join('|');
}

/**
 * Re-reads a held slot assignment against the current signals.
 *
 * Holding the assignment steady must not also freeze what it shows. Slots keep
 * the signals they were assigned, by key, but each one is looked up again so a
 * card renders the latest reading between re-ranks.
 */
export function projectDeviceSlots(
  slots: DeviceSlots,
  signals: readonly DeviceSignal[] = [],
): DeviceSlots {
  const current = new Map(signals.map((signal) => [signal.key, signal]));
  const refresh = (entry: RankedSignal): RankedSignal => {
    const signal = current.get(entry.signal.key);
    return signal ? { ...entry, signal } : entry;
  };

  return {
    ...slots,
    gauge: slots.gauge ? refresh(slots.gauge) : null,
    meta: slots.meta.map(refresh),
    drawer: slots.drawer.map((signal) => current.get(signal.key) ?? signal),
  };
}
