import { Type, type Static } from '@fastify/type-provider-typebox';
import { DeviceTypeSchema } from "../../constants/devices.ts";

export const DeviceStatusSchema = Type.Union([
  Type.Literal("online"),
  Type.Literal("offline"),
  Type.Literal("error"),
  Type.Literal("unknown"),
]);
export type DeviceStatus = Static<typeof DeviceStatusSchema>;

// --- Providers ---

export const ProviderInfoSchema = Type.Object({
  name: Type.String(),
  internal: Type.Boolean(),
});
export type ProviderInfoDTO = Static<typeof ProviderInfoSchema>;

export const GetProvidersResponseSchema = Type.Array(ProviderInfoSchema);
export type GetProvidersResponseDTO = Static<typeof GetProvidersResponseSchema>;

// --- Provider Accounts ---

export const ProviderAccountSchema = Type.Object({
  id: Type.Number(),
  provider: Type.String(),
  name: Type.String(),
  config: Type.Unknown(), // JSONB
  enabled: Type.Boolean(),
  internal: Type.Boolean(),
  created_at: Type.String(),
  updated_at: Type.String(),
});
export type ProviderAccountDTO = Static<typeof ProviderAccountSchema>;

export const GetProviderAccountsResponseSchema = Type.Array(ProviderAccountSchema);
export type GetProviderAccountsResponseDTO = Static<typeof GetProviderAccountsResponseSchema>;

export const PostProviderAccountRequestSchema = Type.Object({
  provider: Type.String(),
  name: Type.String(),
  config: Type.Unknown(),
});
export type PostProviderAccountRequestDTO = Static<typeof PostProviderAccountRequestSchema>;

// --- Discovery ---

export const DiscoveredDeviceSchema = Type.Object({
  externalId: Type.String(),
  name: Type.String(),
  type: DeviceTypeSchema,
  config: Type.Unknown(),
});
export type DiscoveredDeviceDTO = Static<typeof DiscoveredDeviceSchema>;

export const GetDiscoveredDevicesResponseSchema = Type.Array(DiscoveredDeviceSchema);
export type GetDiscoveredDevicesResponseDTO = Static<typeof GetDiscoveredDevicesResponseSchema>;

// --- Devices ---

export const GetDeviceParamsSchema = Type.Object({ id: Type.Number() });
export type GetDeviceParamsDTO = Static<typeof GetDeviceParamsSchema>;

export const GetDeviceResponseSchema = Type.Object({
  id: Type.Number(),
  provider_account_id: Type.Number(),
  external_id: Type.String(),
  name: Type.String(),
  type: DeviceTypeSchema,
  config: Type.Unknown(),
  enabled: Type.Boolean(),
  last_seen: Type.Union([Type.String(), Type.Null()]),
  status: Type.Union([DeviceStatusSchema, Type.Null()]),
  created_at: Type.String(),
  updated_at: Type.String(),
});
export type GetDeviceResponseDTO = Static<typeof GetDeviceResponseSchema>;

export const GetDevicesResponseSchema = Type.Array(GetDeviceResponseSchema);
export type GetDevicesResponseDTO = Static<typeof GetDevicesResponseSchema>;

export const PostDeviceRequestSchema = Type.Object({
  provider_account_id: Type.Number(),
  external_id: Type.String(),
  name: Type.String(),
  type: DeviceTypeSchema,
  config: Type.Optional(Type.Unknown()),
});
export type PostDeviceRequestDTO = Static<typeof PostDeviceRequestSchema>;
