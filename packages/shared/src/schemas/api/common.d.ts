import { type Static, type TAnySchema } from "@sinclair/typebox";
export declare const getPaginatedResponseSchema: <T extends TAnySchema>(dataSchema: T) => import("@sinclair/typebox").TObject<{
    data: T;
    total: import("@sinclair/typebox").TNumber;
    limit: import("@sinclair/typebox").TNumber;
    offset: import("@sinclair/typebox").TNumber;
    hasMore: import("@sinclair/typebox").TBoolean;
}>;
export type PaginatedResponseDTO<T extends TAnySchema> = Static<ReturnType<typeof getPaginatedResponseSchema<T>>>;
