import type { TFunction } from 'i18next';
import { DEVICE_SIGNAL_KEYS, type DeviceSignal } from 'shared';

/**
 * A link strength in words.
 *
 * "-55 dBm" is only meaningful to someone who already knows the scale, and the
 * bar glyph is four states wide with no legend. The words are the reading; the
 * figure is there for anyone who wants to check it.
 *
 * Derived from the bars, never from the dBm. The bars are already the
 * per-radio normalisation the controller applied — reading the raw number
 * again here would put WiFi's idea of "good" onto radios that do not share it,
 * which is the whole thing `RssiLadder` exists to prevent.
 */
function signalQualityKey(lit: number, of: number): string {
  if (of <= 0) {
    return 'devices.signals.quality.very_weak';
  }

  const filled = lit / of;
  const name =
    filled >= 1
      ? 'excellent'
      : filled >= 0.75
        ? 'good'
        : filled >= 0.5
          ? 'fair'
          : filled > 0
            ? 'weak'
            : /*
               * Not "no signal". A device on the bottom rung is still
               * reporting, so it plainly has a link — it is the ladder that
               * has run out of rungs, not the radio that has gone silent.
               * Being unreachable is a different signal entirely.
               */
              'very_weak';

  return `devices.signals.quality.${name}`;
}

/**
 * The signal-strength reading as one line: quality, then the figure.
 *
 * Returned as a plain string so the tooltip and the glyph's accessible name
 * can be the same words, rather than two descriptions of one thing that drift
 * apart. Null when this is not a signal-strength reading, or is one the
 * provider sent without a number to show.
 */
export function signalStrengthText(
  signal: DeviceSignal,
  t: TFunction,
): string | null {
  if (
    signal.key !== DEVICE_SIGNAL_KEYS.SIGNAL_STRENGTH ||
    signal.display.kind !== 'segments' ||
    signal.value.kind !== 'number'
  ) {
    return null;
  }

  return t('devices.signals.signal_strength_summary', {
    quality: t(signalQualityKey(signal.display.lit, signal.display.of)),
    dbm: signal.value.value,
  });
}
