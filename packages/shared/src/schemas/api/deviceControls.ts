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
 * Settings the app understands, each with the words its options are labelled
 * by. A provider that binds one of these is saying its setting means exactly
 * this; the client labels it, and internal services may write it.
 */
export const KNOWN_SETTINGS = {
  /** How long a feeder's lid stays open after the pet leaves. */
  lid_close_delay: ['fast', 'normal', 'slow'],
  /** How a feeder's tray is divided, and what each part holds. */
  bowls: ['single', 'split'],
} as const;

export type KnownSettingKey = keyof typeof KNOWN_SETTINGS;

/** The names a compartment is labelled by. */
export const COMPARTMENT_NAMES = ['single', 'left', 'right'] as const;
export type CompartmentName = (typeof COMPARTMENT_NAMES)[number];

/** What a compartment can be told it holds. */
export const COMPARTMENT_FIELDS = ['food', 'portion'] as const;
export type CompartmentField = (typeof COMPARTMENT_FIELDS)[number];

/**
 * A compartmented setting's value: which layout, and per compartment the
 * value of each field its layout declares. A food is a catalog food id.
 */
export interface CompartmentsValue {
  layout: string;
  compartments: Array<Partial<Record<CompartmentField, number | null>>>;
}

/** The value each known setting holds. */
export interface KnownSettingValues {
  lid_close_delay: (typeof KNOWN_SETTINGS)['lid_close_delay'][number];
  bowls: CompartmentsValue & {
    layout: (typeof KNOWN_SETTINGS)['bowls'][number];
  };
}

const KNOWN_SETTING_KEYS = Object.keys(KNOWN_SETTINGS) as KnownSettingKey[];

/**
 * A key a device declared itself, labelled by the device. Opaque to everyone
 * but the controller that minted it: nothing outside the provider may parse it
 * or depend on it.
 */
export type DeviceControlKey = `dev:${string}`;

export const isDeviceControlKey = (key: string): key is DeviceControlKey =>
  key.startsWith('dev:') && key.length > 4;

export type SettingKey = KnownSettingKey | DeviceControlKey;
export type ActionKey = DeviceControlKey;

const DeviceControlKeySchema = Type.Unsafe<DeviceControlKey>(
  Type.String({ pattern: '^dev:.+$' }),
);

/**
 * Validated against the known keys plus the device-key pattern at runtime;
 * `Unsafe` only names the static type, which TypeBox cannot infer from a union
 * built from an array.
 */
export const SettingKeySchema = Type.Unsafe<SettingKey>(
  Type.Union([
    ...KNOWN_SETTING_KEYS.map((key) => Type.Literal(key)),
    DeviceControlKeySchema,
  ]),
);
export const ActionKeySchema = DeviceControlKeySchema;

// --- Labels ---

/** Every i18n key the API sends for a control's label or an option's. */
export type ControlTextKey =
  | `devices.controls.settings.${KnownSettingKey}`
  | {
      [K in KnownSettingKey]: `devices.controls.options.${K}.${(typeof KNOWN_SETTINGS)[K][number]}`;
    }[KnownSettingKey]
  | `devices.controls.compartments.${CompartmentName}`
  | `devices.controls.fields.${CompartmentField}`;

// Built at runtime from the same tables the type is; TypeScript cannot pair
// each key with only its own options inside `flatMap`, hence the casts.
const CONTROL_TEXT_KEYS: ControlTextKey[] = [
  ...KNOWN_SETTING_KEYS.flatMap((key): ControlTextKey[] => [
    `devices.controls.settings.${key}`,
    ...KNOWN_SETTINGS[key].map(
      (value) => `devices.controls.options.${key}.${value}` as ControlTextKey,
    ),
  ]),
  ...COMPARTMENT_NAMES.map(
    (name) => `devices.controls.compartments.${name}` as const,
  ),
  ...COMPARTMENT_FIELDS.map(
    (field) => `devices.controls.fields.${field}` as const,
  ),
];

/**
 * A known setting is labelled by the client's locale, a device key by the
 * device, verbatim.
 */
export const ControlLabelSchema = Type.Union([
  Type.Object({
    i18n: Type.Unsafe<ControlTextKey>(
      Type.Union(CONTROL_TEXT_KEYS.map((key) => Type.Literal(key))),
    ),
  }),
  Type.Object({ text: Type.String() }),
]);
export type ControlLabel = Static<typeof ControlLabelSchema>;

// --- Value types ---

export const ControlOptionSchema = Type.Object({
  value: Type.String(),
  label: ControlLabelSchema,
});
export type ControlOption = Static<typeof ControlOptionSchema>;

const NumberValueTypeSchema = Type.Object({
  kind: Type.Literal('number'),
  min: Type.Optional(Type.Number()),
  max: Type.Optional(Type.Number()),
  step: Type.Optional(Type.Number()),
  /** Rendered verbatim after the number, e.g. `g`, `kg`, `s`. */
  unit: Type.Optional(Type.String()),
});

/**
 * A food from the app's catalog, by id, or null for none. `groups` are the
 * coarse groups the device can be told about; the picker offers only those.
 */
const FoodValueTypeSchema = Type.Object({
  kind: Type.Literal('food'),
  groups: Type.Array(
    Type.Union([
      Type.Literal('wet'),
      Type.Literal('dry'),
      Type.Literal('treat'),
    ]),
  ),
});

const CompartmentFieldSchema = Type.Object({
  label: ControlLabelSchema,
  type: Type.Union([NumberValueTypeSchema, FoodValueTypeSchema]),
});

/** One way to divide a compartmented device, and what each part takes. */
export const CompartmentLayoutSchema = Type.Object({
  value: Type.String(),
  label: ControlLabelSchema,
  /** One label per compartment; their count is the layout's size. */
  compartments: Type.Array(ControlLabelSchema),
  /** What each compartment of this layout takes; one entry per field. */
  fields: Type.Object({
    food: Type.Optional(CompartmentFieldSchema),
    portion: Type.Optional(CompartmentFieldSchema),
  }),
});
export type CompartmentLayout = Static<typeof CompartmentLayoutSchema>;

/** What a setting holds or an action argument takes, and its bounds. */
export const ControlValueTypeSchema = Type.Union([
  NumberValueTypeSchema,
  Type.Object({ kind: Type.Literal('boolean') }),
  Type.Object({
    kind: Type.Literal('enum'),
    options: Type.Array(ControlOptionSchema),
  }),
  FoodValueTypeSchema,
  /**
   * A device divided into parts (a feeder's bowls, a dispenser's hoppers):
   * which layout it is in, and per part the fields that layout declares.
   * Holds a `CompartmentsValue`.
   */
  Type.Object({
    kind: Type.Literal('compartments'),
    layouts: Type.Array(CompartmentLayoutSchema),
  }),
]);
export type ControlValueType = Static<typeof ControlValueTypeSchema>;
export type NumberValueType = Static<typeof NumberValueTypeSchema>;
export type FoodValueType = Static<typeof FoodValueTypeSchema>;

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

/**
 * Why a write failed, as the settings and action routes answer it. A route
 * answers only once the write is done, so there is no in-between state.
 */
export const WriteFailureSchema = Type.Object({
  statusCode: Type.Number(),
  error: Type.String(),
  message: Type.String(),
  reason: WriteFailureReasonSchema,
});
export type WriteFailureDTO = Static<typeof WriteFailureSchema>;

// --- Read model ---

export const SettingControlSchema = Type.Intersect([
  SettingDescriptorSchema,
  Type.Object({
    /** What the device last reported; null when it has not reported yet. */
    value: Type.Unknown(),
  }),
]);
export type SettingControl = Static<typeof SettingControlSchema>;

export const ActionControlSchema = ActionDescriptorSchema;
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

export const RunDeviceActionRequestSchema = Type.Record(
  Type.String(),
  Type.Unknown(),
);
export type RunDeviceActionRequestDTO = Static<
  typeof RunDeviceActionRequestSchema
>;

/** The answer to a write once the device has it. */
export const DeviceWriteAppliedSchema = Type.Object({
  status: Type.Literal('applied'),
});
export type DeviceWriteAppliedDTO = Static<typeof DeviceWriteAppliedSchema>;
