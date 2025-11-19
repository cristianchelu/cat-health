import { type Static } from "@sinclair/typebox";
export declare const GetEventSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TNumber;
    pet_id: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>;
    device_id: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNull, import("@sinclair/typebox").TNumber]>;
    timestamp: import("@sinclair/typebox").TAny;
    data: import("@sinclair/typebox").TAny;
    raw_data: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNull, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TNumber>]>;
    human_verified: import("@sinclair/typebox").TBoolean;
}>;
export type GetEventDTO = Static<typeof GetEventSchema>;
export declare const GetEventsSchema: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TNumber;
    pet_id: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>;
    device_id: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNull, import("@sinclair/typebox").TNumber]>;
    timestamp: import("@sinclair/typebox").TAny;
    data: import("@sinclair/typebox").TAny;
    raw_data: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNull, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TNumber>]>;
    human_verified: import("@sinclair/typebox").TBoolean;
}>>;
export type GetEventsDTO = Static<typeof GetEventsSchema>;
export declare const PostEventRequestSchema: import("@sinclair/typebox").TObject<{
    data: import("@sinclair/typebox").TAny;
    pet_id: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>;
    device_id: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNull, import("@sinclair/typebox").TNumber]>;
    human_verified: import("@sinclair/typebox").TBoolean;
    timestamp: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    raw_data: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNull, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TNumber>]>>;
}>;
export type PostEventRequestDTO = Static<typeof PostEventRequestSchema>;
export declare const PatchEventParamsSchema: import("@sinclair/typebox").TObject<{
    eventId: import("@sinclair/typebox").TNumber;
}>;
export type PatchEventParamsDTO = Static<typeof PatchEventParamsSchema>;
export declare const PatchEventRequestSchema: import("@sinclair/typebox").TObject<{
    pet_id: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>;
    data: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TAny>;
    human_verified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export type PatchEventRequestDTO = Static<typeof PatchEventRequestSchema>;
export declare const GetEventsQuerySchema: import("@sinclair/typebox").TObject<{
    pet_id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
    device_id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
    startTime: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    endTime: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
    offset: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
}>;
export type GetEventsQueryDTO = Static<typeof GetEventsQuerySchema>;
export declare const GetEventsResponseSchema: import("@sinclair/typebox").TObject<{
    data: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TNumber;
        pet_id: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>;
        device_id: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNull, import("@sinclair/typebox").TNumber]>;
        timestamp: import("@sinclair/typebox").TAny;
        data: import("@sinclair/typebox").TAny;
        raw_data: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNull, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TNumber>]>;
        human_verified: import("@sinclair/typebox").TBoolean;
    }>>;
    total: import("@sinclair/typebox").TNumber;
    limit: import("@sinclair/typebox").TNumber;
    offset: import("@sinclair/typebox").TNumber;
    hasMore: import("@sinclair/typebox").TBoolean;
}>;
export type GetEventsResponseDTO = Static<typeof GetEventsResponseSchema>;
export declare const DeleteEventParamsSchema: import("@sinclair/typebox").TObject<{
    eventId: import("@sinclair/typebox").TNumber;
}>;
export type DeleteEventParamsDTO = Static<typeof DeleteEventParamsSchema>;
export declare const DeleteEventResponseSchema: import("@sinclair/typebox").TObject<{
    success: import("@sinclair/typebox").TBoolean;
}>;
export type DeleteEventResponseDTO = Static<typeof DeleteEventResponseSchema>;
export declare const WeightTrendParamsSchema: import("@sinclair/typebox").TObject<{
    petId: import("@sinclair/typebox").TNumber;
}>;
export type WeightTrendParamsDTO = Static<typeof WeightTrendParamsSchema>;
export declare const WeightTrendQuerySchema: import("@sinclair/typebox").TObject<{
    days: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
}>;
export type WeightTrendQueryDTO = Static<typeof WeightTrendQuerySchema>;
export declare const WeightTrendsResponseSchema: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
    date: import("@sinclair/typebox").TString;
    weight: import("@sinclair/typebox").TNumber;
    timestamp: import("@sinclair/typebox").TString;
}>>;
export type WeightTrendsResponseDTO = Static<typeof WeightTrendsResponseSchema>;
