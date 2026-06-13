import { Type, type Static } from '@fastify/type-provider-typebox';

export const TRACKING_GAP_THRESHOLD_MINUTES_KEY =
  'tracking_gap_threshold_minutes' as const;

export const DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES = 360;

export const GetSettingsResponseSchema = Type.Object({
  tracking_gap_threshold_minutes: Type.Number({ minimum: 0 }),
});
export type GetSettingsResponseDTO = Static<typeof GetSettingsResponseSchema>;

export const PatchSettingsRequestSchema = Type.Object({
  tracking_gap_threshold_minutes: Type.Optional(
    Type.Number({ minimum: 0 }),
  ),
});
export type PatchSettingsRequestDTO = Static<typeof PatchSettingsRequestSchema>;
