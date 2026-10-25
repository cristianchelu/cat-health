import { type Static, Type } from '@fastify/type-provider-typebox';
import { GetEventSchema } from './events.ts';
import {
  PetPresenceContextSchema,
  PetPresenceStateSchema,
} from './eventData.ts';

export const PetSexSchema = Type.Union([
  Type.Literal('female'),
  Type.Literal('male'),
  Type.Literal('unknown'),
]);
export type PetSexDTO = Static<typeof PetSexSchema>;

export const PetAlteredSchema = Type.Union([
  Type.Literal('altered'),
  Type.Literal('intact'),
  Type.Literal('unknown'),
]);
export type PetAlteredDTO = Static<typeof PetAlteredSchema>;

/**
 * 9–15 digits (ISO chips are 15, older AVID-style ones 9 or 10), with spaces
 * allowed between groups. The API schema and the pet form both test this.
 */
export const PET_MICROCHIP_PATTERN = '^\\s*(?:\\d\\s*){9,15}$';

export const PetMicrochipSchema = Type.Union([
  Type.String({ pattern: PET_MICROCHIP_PATTERN }),
  Type.Null(),
]);

export const PetPresenceSchema = Type.Object({
  state: PetPresenceStateSchema,
  context: Type.Optional(PetPresenceContextSchema),
});
export type PetPresenceDTO = Static<typeof PetPresenceSchema>;

export const GetPetParamsSchema = Type.Object({ id: Type.Number() });
export const GetPetResponseSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  breed: Type.String(),
  avatar_url: Type.Optional(Type.String()),
  birth_date: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  microchip: Type.Union([Type.String(), Type.Null()]),
  sex: PetSexSchema,
  altered: PetAlteredSchema,
  /** The latest presence event's state and context; null before the first. */
  presence: Type.Union([PetPresenceSchema, Type.Null()]),
  /** When the profile was closed; null while it is open. */
  closed_at: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});
export type GetPetResponseDTO = Static<typeof GetPetResponseSchema>;

export const PutPetPresenceRequestSchema = PetPresenceSchema;
export type PutPetPresenceRequestDTO = Static<
  typeof PutPetPresenceRequestSchema
>;

export const PutPetPresenceResponseSchema = Type.Object({
  presence: PetPresenceSchema,
  /** Null when the presence was already this one and nothing was written. */
  event: Type.Union([GetEventSchema, Type.Null()]),
});
export type PutPetPresenceResponseDTO = Static<
  typeof PutPetPresenceResponseSchema
>;

export const GetPetsResponseSchema = Type.Array(GetPetResponseSchema);
export type GetPetsResponseDTO = Static<typeof GetPetsResponseSchema>;

export const PostPetRequestSchema = Type.Object({
  name: Type.String(),
  breed: Type.String(),
  birth_date: Type.Optional(
    Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  ),
  microchip: Type.Optional(PetMicrochipSchema),
  sex: Type.Optional(PetSexSchema),
  altered: Type.Optional(PetAlteredSchema),
});
export type PostPetRequestDTO = Static<typeof PostPetRequestSchema>;

export const PatchPetRequestSchema = Type.Partial(
  Type.Object({
    name: Type.String(),
    breed: Type.String(),
    birth_date: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
    microchip: PetMicrochipSchema,
    sex: PetSexSchema,
    altered: PetAlteredSchema,
  }),
);
export type PatchPetRequestDTO = Static<typeof PatchPetRequestSchema>;

/** Largest avatar upload the API accepts, in bytes. */
export const PET_AVATAR_MAX_BYTES = 2_000_000;

/** Image types the avatar upload accepts. */
export const PET_AVATAR_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const PostPetAvatarResponseSchema = Type.Object({
  success: Type.Boolean(),
  avatar: Type.Object({
    url: Type.String(),
    width: Type.Number(),
    height: Type.Number(),
  }),
});
export type PostPetAvatarResponseDTO = Static<
  typeof PostPetAvatarResponseSchema
>;

export const GetPetAvatarResponseSchema = Type.Object({
  url: Type.String(),
  metadata: Type.Union([
    Type.Record(Type.String(), Type.Unknown()),
    Type.Null(),
  ]),
});
export type GetPetAvatarResponseDTO = Static<typeof GetPetAvatarResponseSchema>;

export const DeletePetResponseSchema = Type.Object({ success: Type.Boolean() });
export type DeletePetResponseDTO = Static<typeof DeletePetResponseSchema>;
