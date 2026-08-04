import * as React from 'react';
import type { DeviceSignal } from 'shared';
import {
  deviceSlotSignature,
  projectDeviceSlots,
  rankDeviceSignals,
  type DeviceSlots,
} from '@/lib/deviceSignalRanking';

/**
 * Slot assignment for a device card, held steady while readings drift.
 *
 * Ranking is recomputed only when the signature changes, so two close signals
 * cannot trade the gauge back and forth on every poll. The held assignment is
 * then re-read against the current signals, so the card still shows live
 * values between re-ranks.
 */
export function useDeviceSlots(
  signals: readonly DeviceSignal[] | undefined,
): DeviceSlots {
  const signature = deviceSlotSignature(signals);

  const assignment = React.useMemo(
    () => rankDeviceSignals(signals),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature standing in for the signals is the point.
    [signature],
  );

  return React.useMemo(
    () => projectDeviceSlots(assignment, signals),
    [assignment, signals],
  );
}
