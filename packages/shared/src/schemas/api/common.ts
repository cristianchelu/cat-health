import {
  type Static,
  type TSchema,
  Type,
} from '@fastify/type-provider-typebox';

export const getPaginatedResponseSchema = <T extends TSchema>(dataSchema: T) =>
  Type.Object({
    data: dataSchema,
    total: Type.Number(),
    limit: Type.Number(),
    offset: Type.Number(),
    hasMore: Type.Boolean(),
  });
export type PaginatedResponseDTO<T extends TSchema> = Static<
  ReturnType<typeof getPaginatedResponseSchema<T>>
>;
