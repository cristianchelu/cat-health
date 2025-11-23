import { Type } from "@sinclair/typebox";
import { type Static } from "@sinclair/typebox";
import { DeviceTypeSchema } from "../../constants/devices.ts";

export const DeviceStatusSchema = Type.Union([
  Type.Literal("online"),
  Type.Literal("offline"),
  Type.Literal("error"),
  Type.Literal("unknown"),
]);
export type DeviceStatus = Static<typeof DeviceStatusSchema>;

export const GetDeviceParamsSchema = Type.Object({ id: Type.Number() });
export type GetDeviceParamsDTO = Static<typeof GetDeviceParamsSchema>;

export const GetDeviceResponseSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  type: DeviceTypeSchema,
});
export type GetDeviceResponseDTO = Static<typeof GetDeviceResponseSchema>;

export const GetDevicesResponseSchema = Type.Array(GetDeviceResponseSchema);
export type GetDevicesResponseDTO = Static<typeof GetDevicesResponseSchema>;

export const PostDeviceRequestSchema = Type.Omit(GetDeviceResponseSchema, [
  "id",
]);
export type PostDeviceRequestDTO = Static<typeof PostDeviceRequestSchema>;
