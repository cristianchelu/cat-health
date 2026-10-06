import type {
  ProviderAccountHealthDTO,
  ProviderAccountHealthState,
} from 'shared';
import type { CalloutTone } from '@/components/ui/Callout';
import type { StatusPillVariant } from '@/components/ui/StatusPill';
import type { TranslationKey } from '@/lib/translationKey';

type AccountProblemState = Exclude<ProviderAccountHealthState, 'ok'>;

interface AccountHealthPresentation {
  pill: StatusPillVariant;
  tone: CalloutTone;
  labelKey: TranslationKey;
  /** The account page's sentence; takes `reason` and, while retrying, `when`. */
  calloutKey: TranslationKey;
  /** The same state, said on a device that belongs to the account. */
  deviceMessageKey: TranslationKey;
}

const PRESENTATION: Record<AccountProblemState, AccountHealthPresentation> = {
  starting: {
    pill: 'neutral',
    tone: 'info',
    labelKey: 'settings.account_health.starting',
    calloutKey: 'settings.account_health.callout_starting',
    deviceMessageKey: 'devices.account_health.starting',
  },
  unavailable: {
    pill: 'warn',
    tone: 'warning',
    labelKey: 'settings.account_health.unavailable',
    calloutKey: 'settings.account_health.callout_unavailable',
    deviceMessageKey: 'devices.account_health.unavailable',
  },
  failed: {
    pill: 'error',
    tone: 'error',
    labelKey: 'settings.account_health.failed',
    calloutKey: 'settings.account_health.callout_failed',
    deviceMessageKey: 'devices.account_health.failed',
  },
};

/**
 * True while a running account cannot serve its devices. A switched-off
 * account (`null`) is not a problem: its devices are simply not monitored.
 */
export function hasAccountProblem(
  state: ProviderAccountHealthState | null | undefined,
): state is AccountProblemState {
  return state != null && state !== 'ok';
}

/** How an account's health reads, or `null` when there is nothing to say. */
export function accountHealthPresentation(
  state: ProviderAccountHealthState | null | undefined,
): AccountHealthPresentation | null {
  return hasAccountProblem(state) ? PRESENTATION[state] : null;
}

/** Fast enough to see a start finish, slow enough to idle through an outage. */
const STARTING_POLL_MS = 2_000;
const RETRY_POLL_FLOOR_MS = 5_000;
const RETRY_POLL_CEILING_MS = 60_000;
/** Lands just after the server's attempt rather than just before it. */
const RETRY_POLL_SLACK_MS = 1_000;

/**
 * How soon to ask again about an account the server will move on its own, or
 * `false` when it will not move without a user action. While retrying, the
 * next look is timed to the scheduled attempt, within a floor and a ceiling.
 */
export function accountHealthPollMs(
  health: ProviderAccountHealthDTO | null | undefined,
  now: number = Date.now(),
): number | false {
  if (health?.state === 'starting') return STARTING_POLL_MS;
  if (health?.state !== 'unavailable') return false;

  const nextRetry = health.next_retry_at
    ? Date.parse(health.next_retry_at)
    : Number.NaN;
  if (Number.isNaN(nextRetry)) return RETRY_POLL_FLOOR_MS;
  return Math.min(
    RETRY_POLL_CEILING_MS,
    Math.max(RETRY_POLL_FLOOR_MS, nextRetry - now + RETRY_POLL_SLACK_MS),
  );
}

export { type AccountHealthPresentation };
