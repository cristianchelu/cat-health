import { type Static, Type } from "@sinclair/typebox";

export const DeviceTypeSchema = Type.Union([
  Type.Literal("litterbox"),
  Type.Literal("feeder"),
  Type.Literal("water_fountain"),
  Type.Literal("camera"),
]);
export type DeviceType = Static<typeof DeviceTypeSchema>;
