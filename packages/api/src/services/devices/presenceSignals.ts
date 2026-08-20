import {
  DEVICE_SIGNAL_KEYS,
  type DeviceSignal,
  type DeviceStatus,
} from 'shared';
import { timestampSignal } from './signalBuilders.ts';

/**
 * Connectivity as signals, derived from presence rather than from a provider.
 * Every device type reports reachability the same way, and a device that has
 * stopped answering is the one case where the absence of other readings is
 * itself the thing to show.
 */

/**
 * `unknown` counts as unreachable.
 *
 * It means no controller has ever reported this device in this process — a
 * device restored from a backup, or one whose host is not on this network.
 * Treating it as merely "not offline" leaves the card with nothing at all to
 * say, which reads as a rendering fault rather than as a device we cannot hear
 * from.
 */
const UNREACHABLE: ReadonlySet<DeviceStatus> = new Set([
  'offline',
  'error',
  'unknown',
]);

/** Stands in for the offline duration of a device that was never reached. */
const NEVER_SEEN_HOURS = 24 * 30;

export function presenceSignals(
  status: DeviceStatus | null,
  lastSeen: Date | null,
  now: number,
): DeviceSignal[] {
  const signals: DeviceSignal[] = [];

  if (UNREACHABLE.has(status ?? 'unknown')) {
    const hoursOffline =
      lastSeen != null ? (now - lastSeen.getTime()) / 3_600_000 : Infinity;

    signals.push({
      key: DEVICE_SIGNAL_KEYS.OFFLINE,
      label_key: `devices.signals.${DEVICE_SIGNAL_KEYS.OFFLINE}`,
      value:
        lastSeen != null
          ? { kind: 'timestamp', value: lastSeen.toISOString() }
          : { kind: 'text', key: 'devices.signals.values.never_seen' },
      display: { kind: 'none' },
      icon: 'alert',
      category: 'primary',
      severity: {
        kind: 'hours',
        value: Number.isFinite(hoursOffline) ? hoursOffline : NEVER_SEEN_HOURS,
      },
    });

    /* Only useful alongside the offline signal. On a device answering right
     * now, "last seen: less than a minute ago" spends a meta line restating
     * the status dot. */
    if (lastSeen != null) {
      signals.push(
        timestampSignal(
          { key: DEVICE_SIGNAL_KEYS.LAST_SEEN, icon: 'clock' },
          lastSeen,
        ),
      );
    }
  }

  return signals;
}
