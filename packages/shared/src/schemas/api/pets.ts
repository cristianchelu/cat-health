import { type Static, Type } from "@fastify/type-provider-typebox";
import { GetEventSchema } from "./events.ts";

export const GetPetParamsSchema = Type.Object({ id: Type.Number() });
export const GetPetResponseSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  breed: Type.String(),
  avatar_url: Type.Optional(Type.String()),
  birth_date: Type.String(),
  is_away: Type.Boolean(),
});
export type GetPetResponseDTO = Static<typeof GetPetResponseSchema>;

export const TogglePetPresenceParamsSchema = GetPetParamsSchema;
export type TogglePetPresenceParamsDTO = Static<
  typeof TogglePetPresenceParamsSchema
>;

export const TogglePetPresenceResponseSchema = Type.Object({
  is_away: Type.Boolean(),
  event: GetEventSchema,
});
export type TogglePetPresenceResponseDTO = Static<
  typeof TogglePetPresenceResponseSchema
>;

export const GetPetsResponseSchema = Type.Array(GetPetResponseSchema);
export type GetPetsResponseDTO = Static<typeof GetPetsResponseSchema>;

export const PostPetRequestSchema = Type.Omit(GetPetResponseSchema, [
  "id",
  "is_away",
  "avatar_url",
]);
export type PostPetRequestDTO = Static<typeof PostPetRequestSchema>;

// Partial update schema – all fields optional to allow targeted PATCH updates
export const PatchPetRequestSchema = Type.Partial(
  Type.Omit(GetPetResponseSchema, ["id", "is_away", "avatar_url"]),
);
export type PatchPetRequestDTO = Static<typeof PatchPetRequestSchema>;

// Delete response – simple success boolean
export const DeletePetResponseSchema = Type.Object({ success: Type.Boolean() });
export type DeletePetResponseDTO = Static<typeof DeletePetResponseSchema>;
