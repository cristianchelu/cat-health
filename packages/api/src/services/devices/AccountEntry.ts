import type {
  ProviderAccountHealthDTO,
  ProviderAccountHealthState,
} from 'shared';
import type { ProviderAccount } from '../../database/types/ProviderAccountTable.ts';
import type { AccountHealthReporter, AccountManager } from './types.ts';
import {
  DEFAULT_RETRY_POLICY,
  describeProviderError,
  ProviderPermanentError,
  retryAfterMs,
  retryDelay,
  type RetryPolicy,
} from './providerFailure.ts';

/** Time and chance, injectable so the backoff can be tested without waiting. */
export interface AccountEntryClock {
  now(): number;
  random(): number;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

const SYSTEM_CLOCK: AccountEntryClock = {
  now: () => Date.now(),
  random: () => Math.random(),
  setTimeout: (callback, ms) => {
    const timer = setTimeout(callback, ms);
    // A pending retry is no reason to keep a stopping process alive.
    timer.unref?.();
    return timer;
  },
  clearTimeout: (timer) => clearTimeout(timer),
};

export interface AccountEntryOptions {
  accountId: number;
  /** Builds the provider's manager, wired to report back to this entry. */
  createManager(
    account: ProviderAccount,
    health: AccountHealthReporter,
  ): AccountManager;
  retryPolicy(account: ProviderAccount): RetryPolicy;
  /** The current row, read at every start so a retry runs on today's config. */
  loadAccount(): Promise<ProviderAccount | undefined>;
  /** The devices' side of losing the account, run before its manager stops. */
  onDown(): Promise<void>;
  logger: Pick<Console, 'log' | 'warn' | 'error'>;
  clock?: AccountEntryClock;
}

interface Health {
  state: ProviderAccountHealthState;
  reason?: string;
  since: number;
  nextRetryAt?: number;
  attempts: number;
}

/**
 * One provider account at runtime: the stable place its `AccountManager` is
 * mounted, across the many managers a start, a failure and a retry build and
 * throw away. It owns the account's health and backoff, and runs every start,
 * stop and failure one at a time, so a manager that has been replaced can
 * never tear down or remount over the one that replaced it.
 */
export class AccountEntry {
  readonly accountId: number;
  private readonly options: AccountEntryOptions;
  private readonly clock: AccountEntryClock;
  private current: AccountManager | undefined;
  private health: Health | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every start and stop, so a retry armed before one is void. */
  private generation = 0;
  /** The failure last written in full, so a long outage logs one line per retry. */
  private loggedReason: string | undefined;
  private label: string;
  /** The row the current or last start ran on. */
  private account: ProviderAccount | undefined;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: AccountEntryOptions) {
    this.options = options;
    this.accountId = options.accountId;
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.label = `account ${options.accountId}`;
  }

  /** The mounted manager, or `undefined` while the account is down or off. */
  get manager(): AccountManager | undefined {
    return this.current;
  }

  /** Start now: a boot or a user action, so any backoff begins again. */
  start(): Promise<void> {
    return this.enqueue(async () => {
      this.invalidateRetry();
      await this.unmount();
      this.setHealth('starting', { attempts: 0 });
      await this.mount();
    });
  }

  /** Stop and forget the account's health: it is switched off or going away. */
  stop(): Promise<void> {
    return this.enqueue(async () => {
      this.invalidateRetry();
      await this.unmount();
      this.health = null;
      this.loggedReason = undefined;
    });
  }

  /** Mount a manager built elsewhere, without initializing it (test seam). */
  adopt(manager: AccountManager): void {
    this.current = manager;
    this.setHealth('ok', { attempts: 0 });
  }

  /** `null` while the account is not running. */
  getHealth(): ProviderAccountHealthDTO | null {
    const health = this.health;
    if (!health) return null;
    return {
      state: health.state,
      since: new Date(health.since).toISOString(),
      ...(health.reason != null ? { reason: health.reason } : {}),
      ...(health.nextRetryAt != null
        ? { next_retry_at: new Date(health.nextRetryAt).toISOString() }
        : {}),
      ...(health.attempts > 0 ? { attempts: health.attempts } : {}),
    };
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const run = this.queue.then(operation);
    this.queue = run.catch((error: unknown) => {
      this.options.logger.error(
        `Account ${this.label} operation failed:`,
        error,
      );
    });
    return run;
  }

  /** Runs inside the queue. Never throws for a failed start. */
  private async mount(): Promise<void> {
    const account = await this.options.loadAccount();
    if (!account?.enabled) {
      this.health = null;
      return;
    }
    this.account = account;
    this.label = `${account.name} (${account.provider})`;

    let manager: AccountManager | undefined;
    try {
      const built = this.options.createManager(account, {
        // Queued behind whatever is running, which may be this very start.
        fail: (error) => void this.enqueue(() => this.fail(built, error)),
      });
      manager = built;
      this.current = built;
      await built.initialize();
    } catch (error) {
      await this.fail(manager, error);
      return;
    }

    const recovering = (this.health?.attempts ?? 0) > 0;
    this.setHealth('ok', { attempts: 0 });
    this.loggedReason = undefined;
    this.options.logger.log(
      recovering
        ? `Account ${this.label} recovered`
        : `Initialized account ${this.label}`,
    );
  }

  /** Runs inside the queue: the one path for an account that lost its remote. */
  private async fail(
    manager: AccountManager | undefined,
    error: unknown,
  ): Promise<void> {
    if (manager !== undefined && manager !== this.current) return;
    this.invalidateRetry();
    // Before the manager stops: its controllers report offline as they go, and
    // only the first report of a transition carries the account as its cause.
    try {
      await this.options.onDown();
    } catch (downError) {
      this.options.logger.error(
        `Account ${this.label}: taking its devices down failed:`,
        downError,
      );
    }
    await this.unmount();

    const reason = describeProviderError(error);
    const previousAttempts = this.health?.attempts ?? 0;

    if (error instanceof ProviderPermanentError) {
      this.setHealth('failed', { reason, attempts: previousAttempts });
      this.loggedReason = reason;
      this.options.logger.error(
        `Account ${this.label} failed; not retrying:`,
        error,
      );
      return;
    }

    const attempts = previousAttempts + 1;
    const delayMs = retryDelay(
      this.account
        ? this.options.retryPolicy(this.account)
        : DEFAULT_RETRY_POLICY,
      attempts - 1,
      retryAfterMs(error),
      this.clock.random,
    );
    this.setHealth('unavailable', {
      reason,
      attempts,
      nextRetryAt: this.clock.now() + delayMs,
    });
    this.logUnavailable(reason, attempts, delayMs, error);

    const generation = this.generation;
    this.retryTimer = this.clock.setTimeout(() => {
      this.retryTimer = undefined;
      void this.enqueue(async () => {
        if (generation === this.generation) await this.mount();
      });
    }, delayMs);
  }

  private logUnavailable(
    reason: string,
    attempts: number,
    delayMs: number,
    error: unknown,
  ): void {
    const retryIn = `${Math.round(delayMs / 1000)}s`;
    if (this.loggedReason !== reason) {
      this.loggedReason = reason;
      this.options.logger.error(
        `Account ${this.label} unavailable; retrying in ${retryIn}:`,
        error,
      );
      return;
    }
    this.options.logger.warn(
      `Account ${this.label} still unavailable (attempt ${attempts}, next in ${retryIn}): ${reason}`,
    );
  }

  /** Detached before it stops, so a failure it reports on the way out is stale. */
  private async unmount(): Promise<void> {
    const manager = this.current;
    if (!manager) return;
    this.current = undefined;
    try {
      await manager.shutdown();
    } catch (error) {
      this.options.logger.error(`Error shutting down ${this.label}:`, error);
    }
  }

  private invalidateRetry(): void {
    this.generation += 1;
    if (this.retryTimer === undefined) return;
    this.clock.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private setHealth(
    state: ProviderAccountHealthState,
    fields: Omit<Health, 'state' | 'since'>,
  ): void {
    this.health = {
      ...fields,
      state,
      since:
        this.health?.state === state ? this.health.since : this.clock.now(),
    };
  }
}
