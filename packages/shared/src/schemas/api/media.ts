import { type Static, Type } from '@sinclair/typebox';

// TODO: Remove from here; use real schema
export const MediaMetadataSchema = Type.Object(
  {
    width: Type.Optional(Type.Number()),
    height: Type.Optional(Type.Number()),
    duration: Type.Optional(Type.Number()),
  },
);

// TODO: Remove from here; use real schema
export const MediaSchema = Type.Object({
  id: Type.Number(),
  created_at: Type.Number(),
  file_path: Type.String(),
  mime_type: Type.String(),
  file_size: Type.Number(),
  description: Type.Union([Type.String(), Type.Null()]),
  metadata: Type.Union([MediaMetadataSchema, Type.Null()]),
});

export const GetEventMediaResponseSchema = Type.Array(MediaSchema);
export type GetEventMediaResponseDTO = Static<typeof GetEventMediaResponseSchema>;