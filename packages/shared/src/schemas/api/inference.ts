import { type Static, Type } from '@fastify/type-provider-typebox';

// Inference Provider Account Config
export const InferenceAccountConfigSchema = Type.Object({
  api_key: Type.String(),
  base_url: Type.String(),
});
export type InferenceAccountConfig = Static<
  typeof InferenceAccountConfigSchema
>;

// Pet Recognizer Device Config
export const PetRecognizerConfigSchema = Type.Object({
  model: Type.String(),
  source_device_id: Type.Number(),
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
export type PetRecognizerConfig = Static<typeof PetRecognizerConfigSchema>;

// Request/Response schemas for adding reference images
export const AddReferenceImageRequestSchema = Type.Object({
  pet_id: Type.Number(),
  media_id: Type.Number(),
});
export type AddReferenceImageRequest = Static<
  typeof AddReferenceImageRequestSchema
>;

export const RemoveReferenceImageRequestSchema = Type.Object({
  pet_id: Type.Number(),
  media_id: Type.Number(),
});
export type RemoveReferenceImageRequest = Static<
  typeof RemoveReferenceImageRequestSchema
>;

// Candidate images query params
export const GetCandidateImagesQuerySchema = Type.Object({
  pet_id: Type.Number(),
});
export type GetCandidateImagesQuery = Static<
  typeof GetCandidateImagesQuerySchema
>;
