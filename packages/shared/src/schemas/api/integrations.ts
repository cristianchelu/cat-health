import { type Static, Type } from '@fastify/type-provider-typebox';
import { DeviceTypeSchema } from '../../constants/devices.ts';

export const ProviderCapabilitiesSchema = Type.Object({
  supports_discovery: Type.Optional(Type.Boolean()),
  supports_pet_linking: Type.Optional(Type.Boolean()),
  skip_discovery: Type.Optional(Type.Boolean()),
  allows_direct_registration: Type.Optional(Type.Boolean()),
  supported_device_types: Type.Optional(Type.Array(DeviceTypeSchema)),
});
export type ProviderCapabilities = Static<typeof ProviderCapabilitiesSchema>;

export const ProviderRemotePetSchema = Type.Object({
  external_id: Type.String(),
  name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  metadata: Type.Optional(Type.Unknown()),
});
export type ProviderRemotePet = Static<typeof ProviderRemotePetSchema>;

export const ProviderPetLinkSchema = Type.Object({
  external_pet_id: Type.String(),
  pet_id: Type.Number(),
  remote_name: Type.Optional(Type.String()),
  metadata: Type.Optional(Type.Unknown()),
});
export type ProviderPetLink = Static<typeof ProviderPetLinkSchema>;

export const GetProviderRemotePetsResponseSchema = Type.Array(
  ProviderRemotePetSchema,
);
export type GetProviderRemotePetsResponseDTO = Static<
  typeof GetProviderRemotePetsResponseSchema
>;
