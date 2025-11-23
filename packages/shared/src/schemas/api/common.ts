import { type Static, type TAnySchema, Type } from "@fastify/type-provider-typebox";

export const getPaginatedResponseSchema = <T extends TAnySchema>(
  dataSchema: T,
) =>
  Type.Object({
    data: dataSchema,
    total: Type.Number(),
    limit: Type.Number(),
    offset: Type.Number(),
    hasMore: Type.Boolean(),
  });
export type PaginatedResponseDTO<T extends TAnySchema> = Static<
  ReturnType<typeof getPaginatedResponseSchema<T>>
>;
