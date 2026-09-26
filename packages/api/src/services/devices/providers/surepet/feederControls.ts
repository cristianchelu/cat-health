import type { KnownSettingValues, SettingDescriptor } from 'shared';

import { composeControlSurface } from '../../control/composeControlSurface.ts';
import { pollUntil } from '../../control/observe.ts';
import type {
  Acceptance,
  ControlSurface,
  SettingBinding,
  Settlement,
} from '../../control/types.ts';
import {
  CloseDelay,
  ControlRequestStatus,
  SUREPET_CONTROL_POLL_INTERVAL_MS,
  SUREPET_CONTROL_TIMEOUT_MS,
} from './constants.ts';
import type {
  SurePetControlRequest,
  SurePetControlWrite,
  SurePetDeviceControlPayload,
} from './types.ts';

/** The account's side of a feeder's writes, bound to one cloud device. */
export interface SurePetControlWriter {
  put(write: SurePetControlWrite): Promise<SurePetControlRequest | null>;
  status(): Promise<SurePetControlRequest[]>;
  /** Re-read the device, so a settled write shows what the feeder now has. */
  refresh(): Promise<void>;
}

type ControlState = SurePetDeviceControlPayload | undefined;
type LidCloseDelay = KnownSettingValues['lid_close_delay'];

const CLOSE_DELAY_SECONDS: Record<LidCloseDelay, number> = {
  fast: CloseDelay.FASTER,
  normal: CloseDelay.NORMAL,
  slow: CloseDelay.SLOWER,
};

const lidCloseDelay: SettingBinding<SurePetControlWrite, ControlState> = {
  descriptor: {
    key: 'lid_close_delay',
    label: { i18n: 'devices.controls.settings.lid_close_delay' },
    type: {
      kind: 'enum',
      options: (['fast', 'normal', 'slow'] as const).map((value) => ({
        value,
        label: { i18n: `devices.controls.options.lid_close_delay.${value}` },
      })),
    },
    placement: 'setting',
    group: 'config',
  } satisfies SettingDescriptor,
  read: (control) => {
    const seconds = control?.lid?.close_delay;
    const entry = Object.entries(CLOSE_DELAY_SECONDS).find(
      ([, value]) => value === seconds,
    );
    return entry?.[0] ?? null;
  },
  // Their app sends `lid` whole, so the rest of it rides along unchanged.
  encode: (value, control) => [
    {
      lid: {
        ...control?.lid,
        close_delay: CLOSE_DELAY_SECONDS[value as LidCloseDelay],
      },
    },
  ],
};

const requestStatus = (request: SurePetControlRequest): number | undefined =>
  request.status_id ?? request.status ?? undefined;

/** A request's status as a settlement, or undefined while it is pending. */
function settlementOf(status: number | undefined): Settlement | undefined {
  switch (status) {
    case ControlRequestStatus.PENDING:
      return undefined;
    case ControlRequestStatus.DEVICE_TIMEOUT:
      return { status: 'failed', reason: 'timeout' };
    case ControlRequestStatus.SERVER_ERROR:
    case ControlRequestStatus.DEVICE_ERROR:
      return { status: 'failed', reason: 'rejected' };
    default:
      return { status: 'applied' };
  }
}

/**
 * A SureFeed's writable settings. The cloud queues each write and hands back
 * a request id; the feeder picks it up on its next check-in, which is what
 * `control/status` reports on.
 */
export function createFeederControlSurface(
  control: () => ControlState,
  writer: SurePetControlWriter,
  timing = {
    intervalMs: SUREPET_CONTROL_POLL_INTERVAL_MS,
    timeoutMs: SUREPET_CONTROL_TIMEOUT_MS,
  },
): ControlSurface {
  return composeControlSurface<SurePetControlWrite, ControlState, string>({
    state: control,
    settings: [lidCloseDelay],
    channel: {
      async submit(write): Promise<Acceptance<string>> {
        const request = await writer.put(write);
        // Their app reads `results[0]` unguarded, so a reply without one is
        // an error there too.
        if (!request) {
          return {
            status: 'failed',
            reason: 'unknown',
            message: 'SurePet did not queue the change',
          };
        }
        const settlement = settlementOf(requestStatus(request));
        if (settlement === undefined && request.request_id != null) {
          return { status: 'pending', ref: String(request.request_id) };
        }
        await writer.refresh().catch(() => {});
        return settlement ?? { status: 'applied' };
      },
    },
    confirmer: {
      async settle(requestId, signal) {
        const settlement = await pollUntil(
          async () => {
            const requests = await writer.status();
            const request = requests.find(
              (candidate) => String(candidate.request_id) === requestId,
            );
            // Gone from the queue means the cloud is done with it; their app
            // reloads the device at that point, and so does this.
            return request
              ? settlementOf(requestStatus(request))
              : { status: 'applied' as const };
          },
          { ...timing, signal },
        );
        await writer.refresh().catch(() => {});
        return settlement ?? { status: 'failed', reason: 'timeout' };
      },
    },
  });
}
