import { type Static, Type } from '@fastify/type-provider-typebox';
import { GetEventSchema } from './events.ts';

export const GetPetParamsSchema = Type.Object({ id: Type.Number() });
export const GetPetResponseSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  breed: Type.String(),
  avatar_url: Type.Optional(Type.String()),
  birth_date: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
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

export const PostPetRequestSchema = Type.Object({
  name: Type.String(),
  breed: Type.String(),
  birth_date: Type.Optional(
    Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  ),
});
export type PostPetRequestDTO = Static<typeof PostPetRequestSchema>;

export const PatchPetRequestSchema = Type.Partial(
  Type.Object({
    name: Type.String(),
    breed: Type.String(),
    birth_date: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  }),
);
export type PatchPetRequestDTO = Static<typeof PatchPetRequestSchema>;

export const DeletePetResponseSchema = Type.Object({ success: Type.Boolean() });
export type DeletePetResponseDTO = Static<typeof DeletePetResponseSchema>;
