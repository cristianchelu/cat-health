import { type Static } from "@sinclair/typebox";
export declare const DeviceTypeSchema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"litterbox">, import("@sinclair/typebox").TLiteral<"feeder">, import("@sinclair/typebox").TLiteral<"water_fountain">, import("@sinclair/typebox").TLiteral<"camera">]>;
export type DeviceType = Static<typeof DeviceTypeSchema>;
