import { isRecord } from 'shared';

/**
 * How an account that lost its remote is brought back. Every failure is
 * retried at this pace except a `ProviderPermanentError`, so the cap is what a
 * vendor outage of a day or two costs them: roughly one attempt per `maxMs`.
 */
export interface RetryPolicy {
  baseMs: number;
  maxMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  baseMs: 30_000,
  maxMs: 60 * 60_000,
};

/** Spread of a retry around its nominal delay, as a fraction of it. */
const RETRY_JITTER = 0.2;

/**
 * A failure that repeating cannot fix, such as rejected credentials, where
 * retrying risks a lockout. The account stops until the user edits it or asks
 * for a retry; anything else a provider throws or reports is retried.
 */
export class ProviderPermanentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderPermanentError';
  }
}

/** A server-requested wait carried on the error, as `SurePetClientError` does. */
export function retryAfterMs(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const value = error.retryAfterMs;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * The account's `reason`. undici reports every network failure as a bare
 * "fetch failed" and keeps the useful part (`EAI_AGAIN host`) on `cause`.
 */
export function describeProviderError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = error.cause;
  if (
    cause instanceof Error &&
    cause.message &&
    cause.message !== error.message
  ) {
    return `${error.message} (${cause.message})`;
  }
  return error.message;
}

/**
 * Exponential from `baseMs`, capped at `maxMs`, jittered ±20% so installations
 * that lost the same vendor at the same moment drift apart. A server's
 * `Retry-After` is a floor: its jitter only ever adds time.
 */
export function retryDelay(
  policy: RetryPolicy,
  attempt: number,
  serverRetryAfterMs?: number,
  random: () => number = Math.random,
): number {
  const nominal = Math.min(
    policy.baseMs * 2 ** Math.max(0, attempt),
    policy.maxMs,
  );

  if (serverRetryAfterMs != null) {
    return Math.round(
      Math.max(serverRetryAfterMs, nominal) * (1 + RETRY_JITTER * random()),
    );
  }
  return Math.round(nominal * (1 - RETRY_JITTER + 2 * RETRY_JITTER * random()));
}
