import { Type, type Static } from '@fastify/type-provider-typebox';

/**
 * Device controls: the normalized write side of a device, as signals are its
 * normalized read side. Providers declare what can be written and read it
 * back; consumers only ever see keys, value types and outcomes.
 *
 * Design and rationale: summaries/device-controls-plan.md.
 */

// --- Keys ---

/**
 * A key a device declared itself, labelled by the device. Opaque to everyone
 * but the controller that minted it: nothing outside the provider may parse it
 * or depend on it. Keys with a meaning the app understands, typed and
 * labelled by the client, join `SettingKey` / `ActionKey` beside it.
 */
export type DeviceControlKey = `dev:${string}`;

export const isDeviceControlKey = (key: string): key is DeviceControlKey =>
  key.startsWith('dev:') && key.length > 4;

export type SettingKey = DeviceControlKey;
export type ActionKey = DeviceControlKey;

const DeviceControlKeySchema = Type.Unsafe<DeviceControlKey>(
  Type.String({ pattern: '^dev:.+$' }),
);
export const SettingKeySchema = DeviceControlKeySchema;
export const ActionKeySchema = DeviceControlKeySchema;

// --- Labels ---

/** A device key is labelled by the device, verbatim. */
export const ControlLabelSchema = Type.Object({ text: Type.String() });
export type ControlLabel = Static<typeof ControlLabelSchema>;

// --- Value types ---

export const ControlOptionSchema = Type.Object({
  value: Type.String(),
  label: ControlLabelSchema,
});
export type ControlOption = Static<typeof ControlOptionSchema>;

/** What a setting holds or an action argument takes, and its bounds. */
export const ControlValueTypeSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('number'),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    step: Type.Optional(Type.Number()),
    /** Rendered verbatim after the number, e.g. `g`, `kg`, `s`. */
    unit: Type.Optional(Type.String()),
  }),
  Type.Object({ kind: Type.Literal('boolean') }),
  Type.Object({
    kind: Type.Literal('enum'),
    options: Type.Array(ControlOptionSchema),
  }),
]);
export type ControlValueType = Static<typeof ControlValueTypeSchema>;

// --- Descriptors ---

/**
 * Where a setting lives. A `control` operates the device now and writes as
 * soon as it changes, beside the readings; a `setting` configures how it
 * behaves and joins the draft that the Settings tab's Save commits. Both
 * reach the device the same way.
 */
export const ControlPlacementSchema = Type.Union([
  Type.Literal('control'),
  Type.Literal('setting'),
]);
export type ControlPlacement = Static<typeof ControlPlacementSchema>;

export const ControlGroupSchema = Type.Union([
  Type.Literal('primary'),
  Type.Literal('config'),
  Type.Literal('diagnostic'),
]);
export type ControlGroup = Static<typeof ControlGroupSchema>;

export const SettingDescriptorSchema = Type.Object({
  key: SettingKeySchema,
  label: ControlLabelSchema,
  type: ControlValueTypeSchema,
  placement: ControlPlacementSchema,
  group: ControlGroupSchema,
});
export type SettingDescriptor = Static<typeof SettingDescriptorSchema>;

export const ActionDescriptorSchema = Type.Object({
  key: ActionKeySchema,
  label: ControlLabelSchema,
  args: Type.Record(Type.String(), ControlValueTypeSchema),
  /** The device decides whether this needs a confirmation before it runs. */
  confirm: Type.Boolean(),
  /** False when the device's current state forbids it (resume while running). */
  available: Type.Boolean(),
  group: ControlGroupSchema,
});
export type ActionDescriptor = Static<typeof ActionDescriptorSchema>;

// --- Outcomes ---

export const WriteFailureReasonSchema = Type.Union([
  /** The command broke a value type's bounds or a provider rule. */
  Type.Literal('invalid'),
  Type.Literal('offline'),
  /** The device accepted it but never confirmed in time; it may have landed. */
  Type.Literal('timeout'),
  /** The device or cloud refused it. */
  Type.Literal('rejected'),
  /** The same write is already in flight and the device cannot tell them apart. */
  Type.Literal('busy'),
  Type.Literal('unknown'),
]);
export type WriteFailureReason = Static<typeof WriteFailureReasonSchema>;

export const WriteOutcomeSchema = Type.Union([
  Type.Object({ status: Type.Literal('applied') }),
  Type.Object({ status: Type.Literal('pending'), writeId: Type.String() }),
  Type.Object({
    status: Type.Literal('failed'),
    reason: WriteFailureReasonSchema,
    message: Type.Optional(Type.String()),
  }),
]);
export type WriteOutcome = Static<typeof WriteOutcomeSchema>;

// --- Read model ---

export const PendingWriteSchema = Type.Object({
  writeId: Type.String(),
  /** The value the device was asked for; absent for an action. */
  expected: Type.Optional(Type.Unknown()),
  /** Epoch ms. */
  since: Type.Number(),
});
export type PendingWrite = Static<typeof PendingWriteSchema>;

export const FailedWriteSchema = Type.Object({
  reason: WriteFailureReasonSchema,
  message: Type.Optional(Type.String()),
  /** Epoch ms. */
  at: Type.Number(),
});
export type FailedWrite = Static<typeof FailedWriteSchema>;

const WriteStatusFields = {
  pending: Type.Optional(PendingWriteSchema),
  failed: Type.Optional(FailedWriteSchema),
};

export const SettingControlSchema = Type.Intersect([
  SettingDescriptorSchema,
  Type.Object({
    /** What the device last reported; null when it has not reported yet. */
    value: Type.Unknown(),
    ...WriteStatusFields,
  }),
]);
export type SettingControl = Static<typeof SettingControlSchema>;

export const ActionControlSchema = Type.Intersect([
  ActionDescriptorSchema,
  Type.Object(WriteStatusFields),
]);
export type ActionControl = Static<typeof ActionControlSchema>;

/** Everything a client needs to draw and drive a device's controls. */
export const DeviceControlsSchema = Type.Object({
  settings: Type.Array(SettingControlSchema),
  actions: Type.Array(ActionControlSchema),
});
export type DeviceControlsDTO = Static<typeof DeviceControlsSchema>;

// --- Requests and responses ---

export const PatchDeviceSettingsRequestSchema = Type.Record(
  Type.String(),
  Type.Unknown(),
);
export type PatchDeviceSettingsRequestDTO = Static<
  typeof PatchDeviceSettingsRequestSchema
>;

/** One outcome per key in the request. */
export const PatchDeviceSettingsResponseSchema = Type.Record(
  Type.String(),
  WriteOutcomeSchema,
);
export type PatchDeviceSettingsResponseDTO = Static<
  typeof PatchDeviceSettingsResponseSchema
>;

export const RunDeviceActionRequestSchema = Type.Record(
  Type.String(),
  Type.Unknown(),
);
export type RunDeviceActionRequestDTO = Static<
  typeof RunDeviceActionRequestSchema
>;

export const RunDeviceActionResponseSchema = WriteOutcomeSchema;
export type RunDeviceActionResponseDTO = WriteOutcome;
