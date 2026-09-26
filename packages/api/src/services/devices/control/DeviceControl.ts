import type { DeviceControlsDTO, SettingKey } from 'shared';

import type { EventBus } from '../EventBus.ts';
import type {
  DeviceController,
  DeviceIntegrationContext,
  LiveControllerFailure,
} from '../types.ts';
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

/** A setting or action on one device. */
export type WriteTarget = `setting:${string}` | `action:${string}`;

export interface DeviceControlSettledEvent {
  deviceId: number;
  target: WriteTarget;
  settlement: Settlement;
  origin: ControlOrigin;
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
 * services alike. It validates every command against the device's manifest
 * and runs one device's writes one at a time. A write resolves once it is
 * done: however many steps a provider needs to confirm it, the caller sees
 * one promise that ends applied or failed.
 */
export class DeviceControl {
  private readonly context: DeviceControlContext;
  private readonly eventBus: EventBus;
  private readonly queues = new Map<number, Promise<unknown>>();
  private readonly lifetimes = new Map<number, AbortController>();

  constructor(deps: { context: DeviceControlContext; eventBus: EventBus }) {
    this.context = deps.context;
    this.eventBus = deps.eventBus;
    deps.context.onControllerRetired((deviceId) => this.retire(deviceId));
  }

  /**
   * The controls a device offers, with what it last reported. Sync and
   * cheap: it reads only memory.
   */
  view(controller: DeviceController): DeviceControlsDTO | undefined {
    const surface = controller.controls?.();
    if (!surface) return undefined;
    const manifest = surface.manifest();
    const values = surface.readSettings();
    return {
      settings: manifest.settings.map((descriptor) => ({
        ...descriptor,
        value: values.get(descriptor.key) ?? null,
      })),
      actions: manifest.actions,
    };
  }

  /**
   * Write several settings. Every key is validated before any is written, so
   * a bad value in the patch writes nothing, and the writes stop at the first
   * that fails, so a failure leaves every key after it unwritten.
   */
  async applySettings(
    deviceId: number,
    patch: Record<string, unknown>,
    origin: ControlOrigin,
  ): Promise<ControlResult<Record<string, Settlement>>> {
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
      const problem =
        validateControlValue(descriptor.type, value) ??
        surface.validate({ kind: 'setting', key: descriptor.key, value });
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

    const settlements: Record<string, Settlement> = {};
    for (const command of commands) {
      const settlement = await this.write(deviceId, surface, command, origin);
      settlements[command.key] = settlement;
      if (settlement.status === 'failed') break;
    }
    return { ok: true, value: settlements };
  }

  async runAction(
    deviceId: number,
    key: string,
    args: Record<string, unknown>,
    origin: ControlOrigin,
  ): Promise<ControlResult<Settlement>> {
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
   * Run one command to its end, behind any earlier write to the same device.
   * A provider that reads its state to build a write (read, modify, write)
   * would otherwise race two quick edits into overwriting each other, and
   * waiting for the earlier one to be confirmed means the later one reads
   * what the device now holds.
   */
  private write(
    deviceId: number,
    surface: ControlSurface,
    command: ControlCommand,
    origin: ControlOrigin,
  ): Promise<Settlement> {
    const run = async (): Promise<Settlement> => {
      const submission = await surface.submit(command);
      const settlement =
        submission.status === 'pending'
          ? await submission.settle(this.lifetime(deviceId).signal).catch(
              (error: unknown): Settlement => ({
                status: 'failed',
                reason: 'unknown',
                message: error instanceof Error ? error.message : String(error),
              }),
            )
          : submission;
      this.eventBus.publish(DEVICE_CONTROL_SETTLED, {
        deviceId,
        target: `${command.kind}:${command.key}`,
        settlement,
        origin,
      } satisfies DeviceControlSettledEvent);
      return settlement;
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

  /** The controller is gone: stop following its writes. */
  private retire(deviceId: number): void {
    this.lifetimes.get(deviceId)?.abort();
    this.lifetimes.delete(deviceId);
  }
}
