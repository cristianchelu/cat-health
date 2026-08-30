import { type Static, Type } from '@fastify/type-provider-typebox';

// Inference Provider Account Config
export const InferenceAccountConfigSchema = Type.Object({
  api_key: Type.String(),
  base_url: Type.String(),
});
export type InferenceAccountConfig = Static<
  typeof InferenceAccountConfigSchema
>;

// Per-device recognition attachment

export const DeviceRecognitionConfigSchema = Type.Object({
  /**
   * `null` means "whatever the app ships as its default" — not "no model".
   *
   * Null first, and it has to stay that way: this schema validates a request
   * body, and Fastify's ajv runs with `coerceTypes`, which happily satisfies a
   * leading `String` branch by turning `null` into `''`. Ordered this way the
   * null survives, and an empty string coerces to null — which is the same
   * thing the form means by leaving the field blank.
   */
  model: Type.Union([Type.Null(), Type.String()]),
  /**
   * Scene context and nothing else — what this camera looks at, so the model
   * can tell the animals apart from the surroundings. May be empty. The
   * candidate list and the output contract are code's to own: an earlier shape
   * had this field interpolate a `{{reference_images}}` placeholder, which put
   * a piece of the contract in user config where deleting a line broke it.
   */
  prompt_template: Type.String(),
  auto_identify: Type.Boolean(),
  reference_images: Type.Record(Type.String(), Type.Array(Type.Number())),
  /**
   * Pets this camera never sees, by id — a cat who ignores the hallway
   * fountain, an indoor-only pet on a garden camera.
   *
   * A denylist rather than a roster: absent means "nobody is excluded", which
   * is what every device configured before this field assumed, and a newly
   * adopted pet joins every recognizer the way it did before. Kept separate
   * from `reference_images` so excluding a pet does not throw away the photos
   * that were curated for them; putting them back is one switch, not a
   * re-pick.
   *
   * Fewer candidates measurably identifies better: on real captures, listing a
   * cat who never uses the fountain took recognition from 39/39 to 12/39,
   * because every frame of the cat who does use it became a coin-flip between
   * two names and the model abstained instead.
   */
  ignored_pets: Type.Optional(Type.Array(Type.Number())),
});
export type DeviceRecognitionConfigDTO = Static<
  typeof DeviceRecognitionConfigSchema
>;

/**
 * What a device's recognition attachment holds: which inference account pays
 * for the call, and the scene config that call is made with.
 */
export const DeviceRecognitionLinkSchema = Type.Object({
  account_id: Type.Number(),
  config: DeviceRecognitionConfigSchema,
});
export type DeviceRecognitionLinkDTO = Static<
  typeof DeviceRecognitionLinkSchema
>;
