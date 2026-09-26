import type {
  ActionDescriptor,
  ActionKey,
  SettingDescriptor,
  SettingKey,
  WriteFailureReason,
} from 'shared';

/** How a write ended, once the device has had its say. */
export type Settlement =
  | { status: 'applied' }
  | { status: 'failed'; reason: WriteFailureReason; message?: string };

type Failure = Extract<Settlement, { status: 'failed' }>;

/**
 * What a channel reports once one write has left. `pending` carries whatever
 * the provider's confirmer needs to follow it up (a request id, a call key).
 */
export type Acceptance<R> =
  | { status: 'applied' }
  | { status: 'pending'; ref: R }
  | Failure;

/** A provider's transport: sends one encoded write. */
export interface WriteChannel<W, R = never> {
  submit(write: W): Promise<Acceptance<R>>;
}

/** Turns a pending acceptance into a settlement. */
export interface Confirmer<R> {
  settle(ref: R, signal: AbortSignal): Promise<Settlement>;
}

/**
 * One setting, owned by a provider: its descriptor, how to read it out of the
 * provider's state, and how to encode a new value into that provider's writes.
 * Pure over `S`, so a binding is tested without a device.
 */
export interface SettingBinding<W, S> {
  descriptor: SettingDescriptor;
  read(state: S): unknown;
  encode(value: unknown, state: S): W[];
}

/** One action, owned by a provider. Its descriptor may depend on state. */
export interface ActionBinding<W, S> {
  key: ActionKey;
  descriptor(state: S): ActionDescriptor;
  encode(args: Record<string, unknown>, state: S): W[];
}

export interface ControlManifest {
  settings: SettingDescriptor[];
  actions: ActionDescriptor[];
}

/** One write, already validated against the manifest. */
export type ControlCommand =
  | { kind: 'setting'; key: SettingKey; value: unknown }
  | { kind: 'action'; key: ActionKey; args: Record<string, unknown> };

/** A submitted command, before the device has necessarily confirmed it. */
export type Submission =
  | { status: 'applied' }
  | Failure
  | { status: 'pending'; settle(signal: AbortSignal): Promise<Settlement> };

/**
 * What a controller offers `DeviceControl`. Built by `composeControlSurface`
 * from a provider's bindings, channel and confirmer; nothing above it sees
 * the provider's write or state types.
 */
export interface ControlSurface {
  manifest(): ControlManifest;
  readSettings(): ReadonlyMap<SettingKey, unknown>;
  submit(command: ControlCommand): Promise<Submission>;
}

/** Who asked, carried on every settlement event. */
export type ControlOrigin =
  | { kind: 'user' }
  | { kind: 'service'; name: string };
