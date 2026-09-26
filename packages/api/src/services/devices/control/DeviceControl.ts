import type { DeviceControlsDTO, SettingKey, WriteOutcome } from 'shared';

import type { EventBus } from '../EventBus.ts';
import type {
  DeviceController,
  DeviceIntegrationContext,
  LiveControllerFailure,
} from '../types.ts';
import { PendingLedger, type WriteTarget } from './PendingLedger.ts';
import type {
  ControlCommand,
  ControlOrigin,
  ControlSurface,
  Settlement,
} from './types.ts';
import {
  validateActionArgs,
  validateControlValue,
} from './validateControlValue.ts';

/** Published on the EventBus once a write is applied or has failed. */
export const DEVICE_CONTROL_SETTLED = 'device.control.settled';

export interface DeviceControlSettledEvent {
  deviceId: number;
  target: WriteTarget;
  settlement: Settlement;
  origin: ControlOrigin;
}

/** One accepted write: what to tell the caller now, and how it ends. */
export interface WriteReceipt {
  outcome: WriteOutcome;
  /** Resolves when the device confirms or the write fails. Never rejects. */
  settled: Promise<Settlement>;
}

export type ControlResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: LiveControllerFailure | 'offline' }
  | {
      ok: false;
      reason: 'unknown_key' | 'invalid';
      key: string;
      message: string;
    };

type DeviceControlContext = Pick<
  DeviceIntegrationContext,
  'resolveLiveController' | 'onControllerRetired'
>;

/**
 * The one entry point for writing to a device, for routes and internal
 * services alike. It validates every command against the device's manifest,
 * runs one device's writes one at a time, and keeps the pending ledger the
 * read side overlays on what the device reports.
 */
export class DeviceControl {
  private readonly context: DeviceControlContext;
  private readonly eventBus: EventBus;
  private readonly ledger: PendingLedger;
  private readonly queues = new Map<number, Promise<unknown>>();
  private readonly lifetimes = new Map<number, AbortController>();

  constructor(deps: {
    context: DeviceControlContext;
    eventBus: EventBus;
    now?: () => number;
  }) {
    this.context = deps.context;
    this.eventBus = deps.eventBus;
    this.ledger = new PendingLedger(deps.now);
    deps.context.onControllerRetired((deviceId) => this.retire(deviceId));
  }

  /**
   * The controls a device offers, with what it last reported and any write
   * still in flight. Sync and cheap: it reads only memory.
   */
  view(controller: DeviceController): DeviceControlsDTO | undefined {
    const surface = controller.controls?.();
    if (!surface) return undefined;
    const { deviceId } = controller;
    const manifest = surface.manifest();
    const values = surface.readSettings();
    return {
      settings: manifest.settings.map((descriptor) => ({
        ...descriptor,
        value: values.get(descriptor.key) ?? null,
        ...this.ledger.status(deviceId, `setting:${descriptor.key}`),
      })),
      actions: manifest.actions.map((descriptor) => ({
        ...descriptor,
        ...this.ledger.status(deviceId, `action:${descriptor.key}`),
      })),
    };
  }

  /**
   * Write several settings. Every key is validated before any is written, so
   * a bad value in the patch writes nothing.
   */
  async applySettings(
    deviceId: number,
    patch: Record<string, unknown>,
    origin: ControlOrigin,
  ): Promise<ControlResult<Record<string, WriteReceipt>>> {
    const resolved = await this.resolveSurface(deviceId);
    if (!resolved.ok) return resolved;
    const { surface } = resolved;

    const settings = new Map(
      surface.manifest().settings.map((setting) => [setting.key, setting]),
    );
    const commands: Extract<ControlCommand, { kind: 'setting' }>[] = [];
    for (const [key, value] of Object.entries(patch)) {
      const descriptor = settings.get(key as SettingKey);
      if (!descriptor) {
        return {
          ok: false,
          reason: 'unknown_key',
          key,
          message: `Device ${deviceId} has no setting ${key}`,
        };
      }
      const problem = validateControlValue(descriptor.type, value);
      if (problem) {
        return {
          ok: false,
          reason: 'invalid',
          key,
          message: `${key} ${problem}`,
        };
      }
      commands.push({ kind: 'setting', key: descriptor.key, value });
    }

    const receipts: Record<string, WriteReceipt> = {};
    for (const command of commands) {
      receipts[command.key] = await this.write(
        deviceId,
        surface,
        command,
        origin,
      );
    }
    return { ok: true, value: receipts };
  }

  async runAction(
    deviceId: number,
    key: string,
    args: Record<string, unknown>,
    origin: ControlOrigin,
  ): Promise<ControlResult<WriteReceipt>> {
    const resolved = await this.resolveSurface(deviceId);
    if (!resolved.ok) return resolved;
    const { surface } = resolved;

    const descriptor = surface
      .manifest()
      .actions.find((action) => action.key === key);
    if (!descriptor) {
      return {
        ok: false,
        reason: 'unknown_key',
        key,
        message: `Device ${deviceId} has no action ${key}`,
      };
    }
    if (!descriptor.available) {
      return {
        ok: false,
        reason: 'invalid',
        key,
        message: `${key} is not available right now`,
      };
    }
    const problem = validateActionArgs(descriptor.args, args);
    if (problem) return { ok: false, reason: 'invalid', key, message: problem };

    const command = { kind: 'action', key: descriptor.key, args } as const;
    return {
      ok: true,
      value: await this.write(deviceId, surface, command, origin),
    };
  }

  private async resolveSurface(
    deviceId: number,
  ): Promise<
    | { ok: true; surface: ControlSurface }
    | { ok: false; reason: LiveControllerFailure | 'offline' }
  > {
    const resolved = await this.context.resolveLiveController(deviceId);
    if (!resolved.ok) return resolved;
    const { controller } = resolved;
    const surface = controller.controls?.();
    if (!surface) return { ok: false, reason: 'unavailable' };
    if (controller.getStatus() !== 'online') {
      return { ok: false, reason: 'offline' };
    }
    return { ok: true, surface };
  }

  /**
   * Submit one command behind any earlier write to the same device. A
   * provider that reads its state to build a write (read, modify, write)
   * would otherwise race two quick edits into overwriting each other.
   */
  private write(
    deviceId: number,
    surface: ControlSurface,
    command: ControlCommand,
    origin: ControlOrigin,
  ): Promise<WriteReceipt> {
    const run = async (): Promise<WriteReceipt> => {
      const target: WriteTarget = `${command.kind}:${command.key}`;
      const expected = command.kind === 'setting' ? command.value : undefined;
      const writeId = this.ledger.begin(deviceId, target, expected);
      const finish = (settlement: Settlement): Settlement => {
        this.ledger.settle(deviceId, target, writeId, settlement);
        this.eventBus.publish(DEVICE_CONTROL_SETTLED, {
          deviceId,
          target,
          settlement,
          origin,
        } satisfies DeviceControlSettledEvent);
        return settlement;
      };

      const submission = await surface.submit(command);
      if (submission.status === 'applied') {
        return {
          outcome: { status: 'applied' },
          settled: Promise.resolve(finish(submission)),
        };
      }
      if (submission.status === 'failed') {
        const settlement = finish(submission);
        return { outcome: submission, settled: Promise.resolve(settlement) };
      }

      const settled = submission
        .settle(this.lifetime(deviceId).signal)
        .catch(
          (error: unknown): Settlement => ({
            status: 'failed',
            reason: 'unknown',
            message: error instanceof Error ? error.message : String(error),
          }),
        )
        .then(finish);
      return { outcome: { status: 'pending', writeId }, settled };
    };

    const previous = this.queues.get(deviceId) ?? Promise.resolve();
    const next = previous.then(run, run);
    this.queues.set(
      deviceId,
      next.catch(() => {}),
    );
    return next;
  }

  private lifetime(deviceId: number): AbortController {
    let lifetime = this.lifetimes.get(deviceId);
    if (!lifetime) {
      lifetime = new AbortController();
      this.lifetimes.set(deviceId, lifetime);
    }
    return lifetime;
  }

  /** The controller is gone: stop following its writes and forget them. */
  private retire(deviceId: number): void {
    this.lifetimes.get(deviceId)?.abort();
    this.lifetimes.delete(deviceId);
    this.ledger.forget(deviceId);
  }
}
