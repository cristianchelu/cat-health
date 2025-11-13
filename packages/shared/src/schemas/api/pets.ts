import { type Static, Type } from "@sinclair/typebox";

export const GetPetParamsSchema = Type.Object({ id: Type.Number() });
export const GetPetResponseSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  breed: Type.String(),
  birth_date: Type.Any(), //TODO: Type.Date()
});
export type GetPetResponseDTO = Static<typeof GetPetResponseSchema>;

export const GetPetsResponseSchema = Type.Array(GetPetResponseSchema);
export type GetPetsResponseDTO = Static<typeof GetPetsResponseSchema>;

export const PostPetRequestSchema = Type.Omit(GetPetResponseSchema, ["id"]);
export type PostPetRequestDTO = Static<typeof PostPetRequestSchema>;

// Partial update schema – all fields optional to allow targeted PATCH updates
export const PatchPetRequestSchema = Type.Partial(PostPetRequestSchema);
export type PatchPetRequestDTO = Static<typeof PatchPetRequestSchema>;

// Delete response – simple success boolean
export const DeletePetResponseSchema = Type.Object({ success: Type.Boolean() });
export type DeletePetResponseDTO = Static<typeof DeletePetResponseSchema>;
