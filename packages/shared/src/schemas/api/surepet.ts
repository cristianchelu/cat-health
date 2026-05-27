import { type Static, Type } from '@fastify/type-provider-typebox';

/** SurePetcare device `product_id` values (py-surepetcare `ProductId`). */
export const ProductId = {
  PET: 0,
  HUB: 1,
  PET_DOOR: 3,
  FEEDER_CONNECT: 4,
  DUAL_SCAN_CONNECT: 6,
  POSEIDON_CONNECT: 8,
  DUAL_SCAN_PET_DOOR: 10,
  NO_ID_DOG_BOWL_CONNECT: 32,
} as const;

export type ProductIdValue = (typeof ProductId)[keyof typeof ProductId];

export const SurePetPetLinkSchema = Type.Object({
  surepet_pet_id: Type.Number(),
  pet_id: Type.Number(),
  tag_id: Type.Optional(Type.Number()),
  surepet_name: Type.Optional(Type.String()),
});
export type SurePetPetLink = Static<typeof SurePetPetLinkSchema>;

export const SurePetSyncConfigSchema = Type.Object({
  last_timeline_since_id: Type.Optional(Type.Number()),
});
export type SurePetSyncConfig = Static<typeof SurePetSyncConfigSchema>;

export const SurePetAccountConfigSchema = Type.Object({
  email: Type.String(),
  password: Type.String(),
  device_id: Type.Optional(Type.String()),
  token: Type.Optional(Type.String()),
  token_expires_at: Type.Optional(Type.String()),
  household_id: Type.Optional(Type.Number()),
  pet_links: Type.Optional(Type.Array(SurePetPetLinkSchema)),
  sync: Type.Optional(SurePetSyncConfigSchema),
});
export type SurePetAccountConfig = Static<typeof SurePetAccountConfigSchema>;

export const SurePetFeederConfigSchema = Type.Object({
  product_id: Type.Number(),
  household_id: Type.Number(),
  serial_number: Type.Optional(Type.String()),
});
export type SurePetFeederConfig = Static<typeof SurePetFeederConfigSchema>;

export const SurePetBowlStatusSchema = Type.Object({
  position: Type.Optional(Type.Number()),
  current_weight: Type.Optional(Type.Number()),
});
export type SurePetBowlStatus = Static<typeof SurePetBowlStatusSchema>;

export const SureFeederStateSchema = Type.Object({
  bowl_status: Type.Array(SurePetBowlStatusSchema),
  fill_percentages: Type.Optional(
    Type.Object({
      total: Type.Union([Type.Number(), Type.Null()]),
      per_bowl: Type.Record(Type.String(), Type.Union([Type.Number(), Type.Null()])),
    }),
  ),
  lid_close_delay: Type.Optional(Type.Number()),
  training_mode: Type.Optional(Type.Number()),
  device_rssi: Type.Optional(Type.Number()),
  battery_percent: Type.Optional(Type.Number()),
  last_refreshed_at: Type.Optional(Type.String()),
});
export type SureFeederState = Static<typeof SureFeederStateSchema>;
