import { Type, type Static } from '@fastify/type-provider-typebox';

/**
 * A device signal: one normalized reading of device health.
 *
 * Providers extract signals, and are the only code that knows vendor field
 * names. Consumers work off this shape.
 *
 * Values are typed rather than formatted because number and date formatting is
 * regional and resolved on the client. Signals carry no urgency score because
 * scoring is a single shared table, `scoreDeviceSignal`.
 */

export const SignalToneSchema = Type.Union([
  Type.Literal('calm'),
  Type.Literal('soon'),
  Type.Literal('now'),
]);
export type SignalTone = Static<typeof SignalToneSchema>;

/** Closed union so the client icon map is exhaustive and cannot render blank. */
export const SignalIconSchema = Type.Union([
  Type.Literal('water'),
  Type.Literal('drop'),
  Type.Literal('filter'),
  Type.Literal('pump'),
  Type.Literal('litter'),
  Type.Literal('scoop'),
  Type.Literal('waste'),
  Type.Literal('clean'),
  Type.Literal('food'),
  Type.Literal('scale'),
  Type.Literal('clock'),
  Type.Literal('battery'),
  Type.Literal('signal'),
  Type.Literal('recognition'),
  Type.Literal('camera'),
  Type.Literal('alert'),
  Type.Literal('check'),
]);
export type SignalIcon = Static<typeof SignalIconSchema>;

// --- Value ---

/**
 * What the signal reads, typed so the client formats it regionally.
 * `text` carries an i18n key; the API ships no user-visible English.
 */
export const SignalValueSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('number'),
    value: Type.Number(),
    /** Rendered verbatim after the number, e.g. `g`, `kg`, `ml`. */
    unit: Type.Optional(Type.String()),
    decimals: Type.Optional(Type.Number()),
  }),
  Type.Object({ kind: Type.Literal('percent'), value: Type.Number() }),
  /** Negative means overdue. */
  Type.Object({ kind: Type.Literal('days'), value: Type.Number() }),
  Type.Object({ kind: Type.Literal('timestamp'), value: Type.String() }),
  Type.Object({
    kind: Type.Literal('text'),
    key: Type.String(),
    params: Type.Optional(Type.Record(Type.String(), Type.String())),
  }),
  /** Nothing to say — renders as an em dash. Offline devices use this. */
  Type.Object({ kind: Type.Literal('none') }),
]);
export type SignalValue = Static<typeof SignalValueSchema>;

// --- Display ---

/**
 * The gauge vocabulary, fixed at five kinds. A signal declares how it can be
 * drawn, so a provider whose sensor fits an existing kind needs no client
 * change.
 */

export const SignalPipToneSchema = Type.Union([
  Type.Literal('urination'),
  Type.Literal('defecation'),
  Type.Literal('both'),
  Type.Literal('unknown'),
]);
export type SignalPipTone = Static<typeof SignalPipToneSchema>;

export const SignalSplitCellSchema = Type.Object({
  label_key: Type.String(),
  value: SignalValueSchema,
  /** 0..1 */
  fill: Type.Number(),
});
export type SignalSplitCell = Static<typeof SignalSplitCellSchema>;

export const SignalDisplaySchema = Type.Union([
  /** Continuous bar: drawer %, water %, filter life, storage. */
  Type.Object({ kind: Type.Literal('bar'), fill: Type.Number() }),
  /** Beam sensors, which resolve only to Normal, Low or Empty. */
  Type.Object({
    kind: Type.Literal('segments'),
    lit: Type.Number(),
    of: Type.Number(),
    /**
     * Relative track width per segment, defaulting to even. Steps are not
     * always equal shares of the thing measured: a hopper's beams sit near the
     * base, so its "empty" step is the last few grams rather than a third of
     * the tank, and drawing it as a third overstates what is left. Only the
     * controller knows where its sensor's steps actually fall, so it is the
     * one that says — an evenly-stepped scale such as an RSSI ladder omits it.
     */
    weights: Type.Optional(Type.Array(Type.Number())),
  }),
  /** Deposit pips in visit order; `of` is the track length. */
  Type.Object({
    kind: Type.Literal('pips'),
    of: Type.Number(),
    pips: Type.Array(SignalPipToneSchema),
  }),
  /** Two independently filled cells in one slot, for dual-bowl scales. */
  Type.Object({
    kind: Type.Literal('split'),
    cells: Type.Array(SignalSplitCellSchema, { minItems: 2, maxItems: 2 }),
  }),
  /** No gauge. Text statuses, and the empty track shown when offline. */
  Type.Object({ kind: Type.Literal('none') }),
]);
export type SignalDisplay = Static<typeof SignalDisplaySchema>;

// --- Severity ---

/**
 * The counter the score table reads, normalized to a unit it understands.
 * Omitted for informational signals such as last dispensed or next feed, which
 * backfill meta lines and never take the gauge.
 */
export const SignalSeveritySchema = Type.Object({
  kind: Type.Union([
    /** 0..100 */
    Type.Literal('percent'),
    /** Days remaining; negative is overdue. */
    Type.Literal('days'),
    /** Hours elapsed. */
    Type.Literal('hours'),
    /**
     * 0..1+ of a threshold or interval; the key's score rule says which end
     * is bad. Waste accumulates toward 1, freshness drains toward 0.
     */
    Type.Literal('ratio'),
    /** The signal's own units, with the score table's thresholds in the same. */
    Type.Literal('absolute'),
    /** 0 or 1 — a fault is either present or it isn't. */
    Type.Literal('flag'),
  ]),
  value: Type.Number(),
});
export type SignalSeverity = Static<typeof SignalSeveritySchema>;

// --- Signal ---

export const SignalCategorySchema = Type.Union([
  /** Competes for the gauge and the two meta lines. */
  Type.Literal('primary'),
  /** Status drawer only, never ranked into a slot. RSSI and AI recognition. */
  Type.Literal('drawer'),
  /**
   * Drawn in the drawer and also ranked for a slot. Battery is the case: the
   * drawer cell is always present, and a low battery also earns a meta line.
   */
  Type.Literal('drawer_ranked'),
]);
export type SignalCategory = Static<typeof SignalCategorySchema>;

export const DeviceSignalSchema = Type.Object({
  /** Stable metric id, and the key into the score table. */
  key: Type.String(),
  label_key: Type.String(),
  value: SignalValueSchema,
  display: SignalDisplaySchema,
  icon: SignalIconSchema,
  category: SignalCategorySchema,
  severity: Type.Optional(SignalSeveritySchema),
});
export type DeviceSignal = Static<typeof DeviceSignalSchema>;
