import { Type, type Static } from '@fastify/type-provider-typebox';
import { DeviceTypeSchema } from "../../constants/devices.ts";

export const DeviceStatusSchema = Type.Union([
  Type.Literal("online"),
  Type.Literal("offline"),
  Type.Literal("error"),
  Type.Literal("unknown"),
]);
export type DeviceStatus = Static<typeof DeviceStatusSchema>;

// TODO: More expressive schema
export const EntitySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  type: Type.Union([
    Type.Literal("sensor"),
    Type.Literal("binary_sensor"),
    Type.Literal("switch"),
    Type.Literal("number"),
    Type.Literal("select"),
    Type.Literal("text_sensor"),
    Type.Literal("button"),
    Type.String(),
  ]),
  value: Type.Unknown(),
  unit: Type.Optional(Type.String()),
  options: Type.Optional(Type.Array(Type.String())),
  min: Type.Optional(Type.Number()),
  max: Type.Optional(Type.Number()),
  step: Type.Optional(Type.Number()),
  onLabel: Type.Optional(Type.String()),
  offLabel: Type.Optional(Type.String()),
});
export type EntityDTO = Static<typeof EntitySchema>;

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

export const PatchProviderAccountRequestSchema = Type.Object({
  name: Type.Optional(Type.String()),
  config: Type.Optional(Type.Unknown()),
  enabled: Type.Optional(Type.Boolean()),
});
export type PatchProviderAccountRequestDTO = Static<typeof PatchProviderAccountRequestSchema>;

export const GetProviderAccountParamsSchema = Type.Object({
  id: Type.Number(),
});
export type GetProviderAccountParamsDTO = Static<typeof GetProviderAccountParamsSchema>;

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

export const DeviceCameraCropSchema = Type.Object({
  left: Type.Number(),
  top: Type.Number(),
  width: Type.Number(),
  height: Type.Number(),
});
export type DeviceCameraCrop = Static<typeof DeviceCameraCropSchema>;

export const DeviceCameraConfigSchema = Type.Object({
  crop: Type.Optional(DeviceCameraCropSchema),
  rotate: Type.Optional(Type.Number()),
  /** Which media to acquire, e.g. ['snapshot', 'recording']. Defaults to ['snapshot']. */
  acquisitionTypes: Type.Optional(Type.Array(Type.String())),
  /** Seconds to wait after event ends before fetching recording (e.g. for cameras with minimum clip duration). */
  fetchDelay: Type.Optional(Type.Number()),
});
export type DeviceCameraConfigDTO = Static<typeof DeviceCameraConfigSchema>;

export const DeviceCameraLinkSchema = Type.Object({
  camera_id: Type.Number(),
  config: Type.Optional(DeviceCameraConfigSchema),
});
export type DeviceCameraLinkDTO = Static<typeof DeviceCameraLinkSchema>;

export const GetDeviceResponseSchema = Type.Object({
  id: Type.Number(),
  provider_account_id: Type.Number(),
  provider: Type.String(),
  external_id: Type.String(),
  name: Type.String(),
  type: DeviceTypeSchema,
  config: Type.Unknown(),
  enabled: Type.Boolean(),
  last_seen: Type.Union([Type.String(), Type.Null()]),
  status: Type.Union([DeviceStatusSchema, Type.Null()]),
  state: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  reference_media: Type.Optional(Type.Record(
    Type.String(),
    Type.Array(Type.Object({ id: Type.Number(), file_path: Type.String() })),
  )),
  camera_link: Type.Optional(DeviceCameraLinkSchema),
  created_at: Type.String(),
  updated_at: Type.String(),
});
export type GetDeviceResponseDTO = Static<typeof GetDeviceResponseSchema>;

export const PutDeviceCameraRequestSchema = DeviceCameraLinkSchema;
export type PutDeviceCameraRequestDTO = Static<
  typeof PutDeviceCameraRequestSchema
>;

export const PatchDeviceCameraRequestSchema = Type.Object({
  config: Type.Optional(DeviceCameraConfigSchema),
});
export type PatchDeviceCameraRequestDTO = Static<
  typeof PatchDeviceCameraRequestSchema
>;

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

export const PatchDeviceRequestSchema = Type.Object({
  name: Type.Optional(Type.String()),
  enabled: Type.Optional(Type.Boolean()),
  config: Type.Optional(Type.Unknown()),
});
export type PatchDeviceRequestDTO = Static<typeof PatchDeviceRequestSchema>;

export const WaterFountainStateSchema = Type.Object({
  /** Water Level Percentage */
  waterLevel: Type.Number(),
  /** Days remaining until water needs to be replaced (optional - not all devices track this) */
  waterDaysRemaining: Type.Optional(Type.Number()),
  /** Days remaining until water filter needs to be replaced (optional - not all devices have filters) */
  filterDaysRemaining: Type.Optional(Type.Number()),
  /** Pump Status (optional - not all devices have pumps) */
  pumpStatus: Type.Optional(Type.Union([
    Type.Literal('ok'),
    Type.Literal('error'),
  ])),
  /** Whether the device has an integrated camera */
  hasCamera: Type.Optional(Type.Boolean()),
});
export type WaterFountainState = Static<typeof WaterFountainStateSchema>;

// --- Pet Recognition Testing ---

export const PostDeviceTestIdentifyRequestSchema = Type.Object({
  media_id: Type.Number(),
});
export type PostDeviceTestIdentifyRequestDTO = Static<typeof PostDeviceTestIdentifyRequestSchema>;

export const PostDeviceTestIdentifyResponseSchema = Type.Object({
  pet_id: Type.Union([Type.Number(), Type.Null()]),
  pet_name: Type.String(),
  raw_response: Type.String(),
});
export type PostDeviceTestIdentifyResponseDTO = Static<typeof PostDeviceTestIdentifyResponseSchema>;
