import {
  DEVICE_SIGNAL_KEYS,
  type DeviceSignal,
  type SignalCategory,
  type SignalIcon,
  type SignalValue,
} from 'shared';
import { rssiBars, type RssiLadder } from './signalStrength.ts';

/**
 * Factories for the signal shapes providers emit repeatedly.
 *
 * Label keys follow `devices.signals.<key>` unless a provider passes one, which
 * it does when the same metric needs different wording in different hardware
 * (a feeder's fill level is a hopper on one product and a bowl on another).
 */

const labelKeyFor = (key: string, override?: string) =>
  override ?? `devices.signals.${key}`;

const clampFill = (fill: number) => Math.min(1, Math.max(0, fill));

interface SignalBase {
  key: string;
  icon: SignalIcon;
  labelKey?: string;
  category?: SignalCategory;
}

/** A 0-100 level drawn as a continuous bar. */
export function percentSignal(
  { key, icon, labelKey, category = 'primary' }: SignalBase,
  percent: number,
): DeviceSignal {
  return {
    key,
    label_key: labelKeyFor(key, labelKey),
    value: { kind: 'percent', value: percent },
    display: { kind: 'bar', fill: clampFill(percent / 100) },
    icon,
    category,
    severity: { kind: 'percent', value: percent },
  };
}

/**
 * A countdown in days. `full` is the interval the bar is drawn against; without
 * it the signal still ranks but shows no gauge, since a days-left figure means
 * nothing as a fraction of an unknown whole.
 */
export function daysRemainingSignal(
  { key, icon, labelKey, category = 'primary' }: SignalBase,
  days: number,
  full?: number,
): DeviceSignal {
  return {
    key,
    label_key: labelKeyFor(key, labelKey),
    value: { kind: 'days', value: days },
    display:
      full && full > 0
        ? { kind: 'bar', fill: clampFill(days / full) }
        : { kind: 'none' },
    icon,
    category,
    severity: { kind: 'days', value: days },
  };
}

/** A reading in its own units, such as grams of waste or kilograms of litter. */
export function measureSignal(
  { key, icon, labelKey, category = 'primary' }: SignalBase,
  value: number,
  options: {
    unit?: string;
    decimals?: number;
    /** Drawn against this maximum when the provider knows one. */
    full?: number;
    severity?: DeviceSignal['severity'];
  } = {},
): DeviceSignal {
  const { unit, decimals, full, severity } = options;
  return {
    key,
    label_key: labelKeyFor(key, labelKey),
    value: { kind: 'number', value, unit, decimals },
    display:
      full && full > 0
        ? { kind: 'bar', fill: clampFill(value / full) }
        : { kind: 'none' },
    icon,
    category,
    severity,
  };
}

/** A state the device names rather than measures, such as pump flow. */
export function statusSignal(
  { key, icon, labelKey, category = 'primary' }: SignalBase,
  valueKey: string,
  faulted: boolean,
): DeviceSignal {
  return {
    key,
    label_key: labelKeyFor(key, labelKey),
    value: { kind: 'text', key: valueKey },
    display: { kind: 'none' },
    icon,
    category,
    severity: { kind: 'flag', value: faulted ? 1 : 0 },
  };
}

/** An informational moment in time. Backfills a slot and never ranks. */
export function timestampSignal(
  { key, icon, labelKey, category = 'primary' }: SignalBase,
  at: Date | string,
): DeviceSignal {
  return {
    key,
    label_key: labelKeyFor(key, labelKey),
    value: {
      kind: 'timestamp',
      value: at instanceof Date ? at.toISOString() : at,
    },
    display: { kind: 'none' },
    icon,
    category,
  };
}

export function signalValueNone(): SignalValue {
  return { kind: 'none' };
}

/**
 * Link strength as a bar glyph.
 *
 * The ladder is the caller's to supply and has no default: dBm means the same
 * thing on every radio but bars do not, and only the controller knows which
 * radio it read. Requiring it is what stops the next provider inheriting
 * WiFi's cutoffs for a link that is not WiFi. See `signalStrength.ts`.
 */
export function signalStrengthSignal(
  dbm: number,
  ladder: RssiLadder,
): DeviceSignal {
  return {
    key: DEVICE_SIGNAL_KEYS.SIGNAL_STRENGTH,
    label_key: `devices.signals.${DEVICE_SIGNAL_KEYS.SIGNAL_STRENGTH}`,
    /* The raw reading outlives the binning — the detail page shows dBm. */
    value: { kind: 'number', value: dbm, unit: 'dBm' },
    display: {
      kind: 'segments',
      lit: rssiBars(dbm, ladder),
      of: ladder.length,
    },
    icon: 'signal',
    category: 'drawer',
  };
}

/** Battery is drawn in the drawer and also competes for a meta line. */
export function batterySignal(percent: number): DeviceSignal {
  return percentSignal(
    {
      key: DEVICE_SIGNAL_KEYS.BATTERY,
      icon: 'battery',
      category: 'drawer_ranked',
    },
    Math.round(percent),
  );
}
