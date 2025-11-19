import { type Static } from "@sinclair/typebox";
export declare const GetDeviceParamsSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TNumber;
}>;
export type GetDeviceParamsDTO = Static<typeof GetDeviceParamsSchema>;
export declare const GetDeviceResponseSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TNumber;
    name: import("@sinclair/typebox").TString;
    type: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"litterbox">, import("@sinclair/typebox").TLiteral<"feeder">, import("@sinclair/typebox").TLiteral<"water_fountain">, import("@sinclair/typebox").TLiteral<"camera">]>;
}>;
export type GetDeviceResponseDTO = Static<typeof GetDeviceResponseSchema>;
export declare const GetDevicesResponseSchema: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TNumber;
    name: import("@sinclair/typebox").TString;
    type: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"litterbox">, import("@sinclair/typebox").TLiteral<"feeder">, import("@sinclair/typebox").TLiteral<"water_fountain">, import("@sinclair/typebox").TLiteral<"camera">]>;
}>>;
export type GetDevicesResponseDTO = Static<typeof GetDevicesResponseSchema>;
export declare const PostDeviceRequestSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString;
    type: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"litterbox">, import("@sinclair/typebox").TLiteral<"feeder">, import("@sinclair/typebox").TLiteral<"water_fountain">, import("@sinclair/typebox").TLiteral<"camera">]>;
}>;
export type PostDeviceRequestDTO = Static<typeof PostDeviceRequestSchema>;
