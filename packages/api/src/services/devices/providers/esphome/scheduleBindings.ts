/**
 * Maintenance-schedule bindings: the shapes a firmware can state "when is
 * this due" in, and the contract ids the default shapes read.
 *
 * One canonical metric — water freshness, filter life — has no canonical
 * sensor, because firmwares genuinely differ in what they know. A device with
 * a clock publishes the due moment itself; one that only counts publishes
 * days remaining; one that remembers being serviced publishes that moment and
 * an interval. All three shapes reduce to the same reading here, so the
 * controller never branches on where a number came from.
 *
 * Ids follow the entity contract in `docs/esphome-device-contract.md`.
 * Firmware that cannot conform gets a profile — a data entry mapping its ids
 * onto these shapes — never a special case in a controller.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type ScheduleBinding =
  /** The device publishes the due moment. Survives restarts on both ends. */
  | { kind: 'due'; due: string; interval?: string }
  /** A bare countdown, for firmware that reports nothing else. */
  | { kind: 'remaining'; remaining: string; interval?: string }
  /** The device remembers when it was serviced; due is that plus interval. */
  | { kind: 'lastChanged'; lastChanged: string; interval: string };

/** How a controller exposes its entity table to the resolver. */
export interface ScheduleSensorReader {
  /** The entity exists in the device's entity list. */
  has(objectId: string): boolean;
  /** Latest finite numeric reading, or null when absent or unpublished. */
  number(objectId: string): number | null;
  /** The entity's declared unit, when it declared one. */
  unit(objectId: string): string | undefined;
}

export interface ScheduleReading {
  /** Negative once overdue. Fractional, so a 12-hour cycle stays honest. */
  daysRemaining: number;
  /**
   * The full cycle length, known only when the firmware exposes it. The
   * gauge bar and the urgency ratio both need it; without it the countdown
   * still shows but carries no urgency band.
   */
  intervalDays?: number;
}

/**
 * Durations arrive in whatever unit the sensor declares. The contract's
 * default is days, so an undeclared or unrecognized unit reads as days
 * rather than guessing from magnitude.
 */
const DAYS_PER_UNIT: Record<string, number> = {
  d: 1,
  day: 1,
  days: 1,
  h: 1 / 24,
  hr: 1 / 24,
  hour: 1 / 24,
  hours: 1 / 24,
  min: 1 / 1440,
  minute: 1 / 1440,
  minutes: 1 / 1440,
  s: 1 / 86400,
  sec: 1 / 86400,
  second: 1 / 86400,
  seconds: 1 / 86400,
};

function durationDays(
  reader: ScheduleSensorReader,
  objectId: string,
): number | null {
  const value = reader.number(objectId);
  if (value === null) return null;
  const unit = reader.unit(objectId)?.toLowerCase();
  return value * (unit !== undefined ? (DAYS_PER_UNIT[unit] ?? 1) : 1);
}

/** ESPHome timestamps are epoch seconds; tolerate milliseconds anyway. */
function epochMs(value: number): number {
  return value >= 1e12 ? value : value * 1000;
}

/** The entities a shape reads must all exist before the shape is chosen. */
function bindingPresent(
  binding: ScheduleBinding,
  reader: ScheduleSensorReader,
): boolean {
  switch (binding.kind) {
    case 'due':
      return reader.has(binding.due);
    case 'remaining':
      return reader.has(binding.remaining);
    case 'lastChanged':
      return reader.has(binding.lastChanged) && reader.has(binding.interval);
  }
}

/**
 * Resolve a schedule against the device's live readings.
 *
 * The shape is chosen by which entities the device lists, not by which have
 * published: a firmware states its schedule one way, and a listed sensor
 * that hasn't spoken yet means "not yet", not "ask differently". Returns
 * null until the chosen shape's values arrive.
 */
export function readSchedule(
  bindings: readonly ScheduleBinding[],
  reader: ScheduleSensorReader,
  nowMs: number,
): ScheduleReading | null {
  const binding = bindings.find((entry) => bindingPresent(entry, reader));
  if (!binding) return null;

  const intervalDays =
    binding.interval !== undefined && reader.has(binding.interval)
      ? (durationDays(reader, binding.interval) ?? undefined)
      : undefined;

  switch (binding.kind) {
    case 'due': {
      const due = reader.number(binding.due);
      if (due === null) return null;
      return {
        daysRemaining: (epochMs(due) - nowMs) / DAY_MS,
        intervalDays,
      };
    }
    case 'remaining': {
      const remaining = durationDays(reader, binding.remaining);
      if (remaining === null) return null;
      return { daysRemaining: remaining, intervalDays };
    }
    case 'lastChanged': {
      const last = reader.number(binding.lastChanged);
      if (last === null || intervalDays === undefined) return null;
      return {
        daysRemaining: (epochMs(last) - nowMs) / DAY_MS + intervalDays,
        intervalDays,
      };
    }
  }
}

// --- Water source contract ---

export interface WaterScheduleContract {
  waterFreshness: readonly ScheduleBinding[];
  filterLife: readonly ScheduleBinding[];
}

/**
 * Shapes in preference order: a due timestamp is a fact, a countdown decays
 * between publishes, and last-changed needs arithmetic — but any of them
 * gets the signal on the card.
 */
const CONTRACT: WaterScheduleContract = {
  waterFreshness: [
    { kind: 'due', due: 'water_change_due', interval: 'water_change_interval' },
    {
      kind: 'remaining',
      remaining: 'water_days_remaining',
      interval: 'water_change_interval',
    },
    {
      kind: 'lastChanged',
      lastChanged: 'water_last_changed',
      interval: 'water_reminder_interval',
    },
  ],
  filterLife: [
    {
      kind: 'due',
      due: 'filter_change_due',
      interval: 'filter_change_interval',
    },
    {
      kind: 'remaining',
      remaining: 'filter_days_remaining',
      interval: 'filter_change_interval',
    },
  ],
};

// --- Litterbox contract ---

/**
 * Deep clean (full litter change), in the same shapes. The countdown is
 * second because older firmware only had `deep_clean_timer`, and it stays
 * bound on boxes that haven't been reflashed to publish the due moment.
 */
export const DEEP_CLEAN_BINDINGS: readonly ScheduleBinding[] = [
  { kind: 'due', due: 'deep_clean_due', interval: 'litter_change_interval' },
  {
    kind: 'remaining',
    remaining: 'deep_clean_timer',
    interval: 'litter_change_interval',
  },
];

/**
 * Firmware whose ids differ from the contract, keyed by a `projectName`
 * prefix (`Vendor.Product`). Empty today — conforming firmware rides the
 * contract — and a stock third-party device lands here as one data entry,
 * never as a branch in a controller.
 */
const PROFILES: Record<string, Partial<WaterScheduleContract>> = {};

export function waterScheduleContract(
  projectName?: string,
): WaterScheduleContract {
  const name = projectName?.toLowerCase();
  const prefix =
    name !== undefined
      ? Object.keys(PROFILES).find((key) => name.startsWith(key.toLowerCase()))
      : undefined;
  return prefix !== undefined ? { ...CONTRACT, ...PROFILES[prefix] } : CONTRACT;
}
