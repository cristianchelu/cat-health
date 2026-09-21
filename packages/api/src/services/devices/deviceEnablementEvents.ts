import { sql } from 'kysely';
import type {
  DeviceEnablementCause,
  DeviceEnablementEventData,
} from '../../domain/events.ts';
import {
  recordDeviceEvent,
  type RecordDeviceEventDeps,
} from '../events/recordDeviceEvent.ts';
import { isDeviceReachable } from './deviceEnablement.ts';

/** The two switches a device sits behind, as `isDeviceReachable` reads them. */
export type DeviceSwitches = Parameters<typeof isDeviceReachable>[0];

/**
 * Post "switched off" / "switched on" to the device's timeline when its
 * reachability — both switches on — changes.
 *
 * The previous state is read back from the timeline itself rather than held
 * in RAM: the switch survives restarts, the process does not, and the two
 * paths that can flip it (device patch, account patch) do not know what the
 * row said before. Re-running for a config-only edit therefore writes
 * nothing. A device with no enablement event yet counts as enabled, which is
 * what a freshly registered row is; a row switched off before this kind
 * existed needs its "disabled" posted by hand, or its first switch-on goes
 * unrecorded.
 *
 * `movedBy` is the switch the caller just flipped. It only matters when both
 * end up on: a device that ends up off is off because of whichever switch is
 * off, its own first.
 */
export async function recordEnablementTransition(
  deps: RecordDeviceEventDeps,
  deviceId: number,
  switches: DeviceSwitches,
  movedBy: DeviceEnablementCause,
): Promise<void> {
  const reachable = isDeviceReachable(switches);
  if (reachable === (await isRecordedAsEnabled(deps, deviceId))) {
    return;
  }

  const data: DeviceEnablementEventData = {
    type: 'device_enablement',
    enabled: reachable,
    cause: !switches.enabled
      ? 'device'
      : !switches.account_enabled
        ? 'account'
        : movedBy,
  };
  await recordDeviceEvent(deps, {
    deviceId,
    data,
    pet_id: null,
    human_verified: true,
  });
}

async function isRecordedAsEnabled(
  deps: RecordDeviceEventDeps,
  deviceId: number,
): Promise<boolean> {
  const latest = await deps.db
    .selectFrom('event')
    .select('data')
    .where('device_id', '=', deviceId)
    .where(sql`json_extract(data, '$.type')`, '=', 'device_enablement')
    .orderBy('timestamp', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();

  return latest?.data?.type === 'device_enablement'
    ? latest.data.enabled
    : true;
}
