import { randomUUID } from 'node:crypto';

import type { FailedWrite, PendingWrite } from 'shared';

import type { Settlement } from './types.ts';

/** How long a failed write stays visible to the client. */
const FAILED_WRITE_TTL_MS = 5 * 60_000;

/** A setting or action on one device. */
export type WriteTarget = `setting:${string}` | `action:${string}`;

interface TargetEntry {
  pending?: PendingWrite;
  failed?: FailedWrite;
}

/**
 * In-memory record of writes the device has not confirmed yet, and of recent
 * failures, per device and target. Only a settlement moves an entry: the
 * ledger never inspects device state itself.
 */
export class PendingLedger {
  private readonly devices = new Map<number, Map<WriteTarget, TargetEntry>>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Start a write; a newer write to the same target replaces any older one. */
  begin(deviceId: number, target: WriteTarget, expected?: unknown): string {
    const writeId = randomUUID();
    this.targets(deviceId).set(target, {
      pending: { writeId, expected, since: this.now() },
    });
    return writeId;
  }

  /**
   * Record how a write ended. Ignored when a newer write has since taken the
   * target, so a slow settlement cannot overwrite a fresher one.
   */
  settle(
    deviceId: number,
    target: WriteTarget,
    writeId: string,
    settlement: Settlement,
  ): void {
    const targets = this.devices.get(deviceId);
    if (targets?.get(target)?.pending?.writeId !== writeId) return;
    if (settlement.status === 'applied') {
      targets.delete(target);
      return;
    }
    targets.set(target, {
      failed: {
        reason: settlement.reason,
        message: settlement.message,
        at: this.now(),
      },
    });
  }

  status(deviceId: number, target: WriteTarget): TargetEntry {
    const targets = this.devices.get(deviceId);
    const entry = targets?.get(target);
    if (!entry) return {};
    if (entry.failed && this.now() - entry.failed.at > FAILED_WRITE_TTL_MS) {
      targets?.delete(target);
      return {};
    }
    return entry;
  }

  /** Drop everything for a device whose controller is gone. */
  forget(deviceId: number): void {
    this.devices.delete(deviceId);
  }

  private targets(deviceId: number): Map<WriteTarget, TargetEntry> {
    let targets = this.devices.get(deviceId);
    if (!targets) {
      targets = new Map();
      this.devices.set(deviceId, targets);
    }
    return targets;
  }
}
