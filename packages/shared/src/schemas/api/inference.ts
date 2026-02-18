import { type Static, Type } from "@fastify/type-provider-typebox";

// Inference Provider Account Config
export const InferenceAccountConfigSchema = Type.Object({
  api_key: Type.String(),
  base_url: Type.String(),
});
export type InferenceAccountConfig = Static<typeof InferenceAccountConfigSchema>;

// Pet Recognizer Device Config
export const PetRecognizerConfigSchema = Type.Object({
  model: Type.String(),
  source_device_id: Type.Number(),
  prompt_template: Type.String(),
  auto_identify: Type.Boolean(),
  reference_images: Type.Record(
    Type.String(),
    Type.Array(Type.Number()),
  ),
});
export type PetRecognizerConfig = Static<typeof PetRecognizerConfigSchema>;

// Request/Response schemas for adding reference images
export const AddReferenceImageRequestSchema = Type.Object({
  pet_id: Type.Number(),
  media_id: Type.Number(),
});
export type AddReferenceImageRequest = Static<typeof AddReferenceImageRequestSchema>;

export const RemoveReferenceImageRequestSchema = Type.Object({
  pet_id: Type.Number(),
  media_id: Type.Number(),
});
export type RemoveReferenceImageRequest = Static<typeof RemoveReferenceImageRequestSchema>;

// Candidate images query params
export const GetCandidateImagesQuerySchema = Type.Object({
  pet_id: Type.Number(),
});
export type GetCandidateImagesQuery = Static<typeof GetCandidateImagesQuerySchema>;
