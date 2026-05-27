import { Type, type Static } from "@fastify/type-provider-typebox";
import { getPaginatedResponseSchema } from "./common.ts";

export const EventTypeSchema = Type.Union([
  Type.Literal("weight_measurement"),
  Type.Literal("water_intake"),
  Type.Literal("litterbox_use"),
  Type.Literal("food_intake"),
  Type.Literal("litterbox_maintenance"),
]);
export type EventType = Static<typeof EventTypeSchema>;

export const LitterboxUseEliminationTypeSchema = Type.Union([
  Type.Literal("urination"),
  Type.Literal("defecation"),
  Type.Literal("both"),
  Type.Literal("no_elimination"),
  Type.Literal("unknown"),
]);

export type LitterboxUseEliminationType =
  Static<typeof LitterboxUseEliminationTypeSchema>;

/** Provider-specific metadata on events (discriminated by `provider`). */
export const SurePetEventProviderDataSchema = Type.Object({
  provider: Type.Literal("surepet"),
  external_key: Type.String(),
  tag_id: Type.Optional(Type.Number()),
  /** SurePet cloud device id */
  device_id: Type.Optional(Type.Number()),
  /** SurePet cloud pet id */
  pet_id: Type.Optional(Type.Number()),
  duration_s: Type.Optional(Type.Number()),
  timeline_entry_id: Type.Optional(Type.Number()),
});
export type SurePetEventProviderData = Static<
  typeof SurePetEventProviderDataSchema
>;

export const EventProviderDataSchema = Type.Union([
  SurePetEventProviderDataSchema,
]);
export type EventProviderData = Static<typeof EventProviderDataSchema>;

/** Sample rate (Hz); must match `StateAnalyzer` on the device path. */
export const LITTERBOX_SAMPLE_HZ = 10;

/**
 * One row from server `StateAnalyzer` periods, persisted on the event as `data.segments`.
 * Sample indices `start` / `end` align with the weight array; use `LITTERBOX_SAMPLE_HZ` (or derived Hz from duration/length) for seconds in the UI.
 * Per-interval stats (variance, mean) are not persisted — UIs that need them recompute from `raw_data` weights.
 */
export interface LitterboxAnalysisStatePeriod {
  state: string;
  start: number;
  end: number;
  /** Urination vs defecation for `eliminating` rows; set server-side (underlying variance is not stored). */
  elimination_type?: "urination" | "defecation";
}

/** Timeline badge row: seconds from sample indices; `elimination_type` comes from persisted segments. */
export interface LitterboxEliminationBadgeSegment {
  elimination_type: "urination" | "defecation";
  start_s: number;
  end_s: number;
}

export const GetEventSchema = Type.Object({
  id: Type.Number(),
  parent_event_id: Type.Union([Type.Number(), Type.Null()]),
  pet_id: Type.Union([Type.Number(), Type.Null()]),
  device_id: Type.Union([Type.Null(), Type.Number()]),
  timestamp: Type.Any(), // TODO: Type.Date(),
  data: Type.Any(), // TODO: Type
  raw_data: Type.Union([Type.Null(), Type.Array(Type.Number())]),
  human_verified: Type.Boolean(),
});
export type GetEventDTO = Static<typeof GetEventSchema>;

export const GetEventsSchema = Type.Array(GetEventSchema);
export type GetEventsDTO = Static<typeof GetEventsSchema>;

export const PostEventRequestSchema = Type.Omit(GetEventSchema, ["id", "timestamp", "raw_data"]);
export type PostEventRequestDTO = Static<typeof PostEventRequestSchema>;

export const PatchEventParamsSchema = Type.Object({ eventId: Type.Number() });
export type PatchEventParamsDTO = Static<typeof PatchEventParamsSchema>;

export const PatchEventRequestSchema = Type.Object({
  pet_id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  data: Type.Optional(Type.Any()),
  human_verified: Type.Optional(Type.Boolean()),
});
export type PatchEventRequestDTO = Static<typeof PatchEventRequestSchema>;

export const GetEventsQuerySchema = Type.Object({
  pet_id: Type.Optional(Type.Number()),
  device_id: Type.Optional(Type.Number()),
  startTime: Type.Optional(Type.String({ format: "date-time" })), // ISO 8601 format
  endTime: Type.Optional(Type.String({ format: "date-time" })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 5000 })),
  offset: Type.Optional(Type.Number({ minimum: 0 })),
  includeChildren: Type.Optional(Type.Boolean()),
  human_verified: Type.Optional(Type.Boolean()),
});
export type GetEventsQueryDTO = Static<typeof GetEventsQuerySchema>;

export const GetEventsResponseSchema =
  getPaginatedResponseSchema(GetEventsSchema);
export type GetEventsResponseDTO = Static<typeof GetEventsResponseSchema>;

export const DeleteEventParamsSchema = Type.Object({ eventId: Type.Number() });
export type DeleteEventParamsDTO = Static<typeof DeleteEventParamsSchema>;

export const DeleteEventResponseSchema = Type.Object({
  success: Type.Boolean(),
});
export type DeleteEventResponseDTO = Static<typeof DeleteEventResponseSchema>;

// Weight trends
export const WeightTrendParamsSchema = Type.Object({ petId: Type.Number() });
export type WeightTrendParamsDTO = Static<typeof WeightTrendParamsSchema>;

export const WeightTrendQuerySchema = Type.Object({
  days: Type.Optional(Type.Number({ minimum: 1 })),
  timezone: Type.Optional(Type.String()),
});
export type WeightTrendQueryDTO = Static<typeof WeightTrendQuerySchema>;

export const WeightTrendsResponseSchema = Type.Array(
  Type.Object({
    date: Type.String(),
    weight: Type.Number(),
    timestamp: Type.String(),
  }),
);
export type WeightTrendsResponseDTO = Static<typeof WeightTrendsResponseSchema>;

export const WaterIntakeEventDataSchema = Type.Object({
  type: Type.Literal('water_intake'),
  amount: Type.Number(),
  duration: Type.Optional(Type.Number()),
  source: Type.Optional(Type.Union([Type.Literal('drinking'), Type.Literal('food')])),
  raw_amount: Type.Optional(Type.Number()),
  excluded_amount: Type.Optional(Type.Number()),
  filtered: Type.Optional(Type.Boolean()),
});
export type WaterIntakeEventDataDTO = Static<typeof WaterIntakeEventDataSchema>;

// Water trends
export const WaterTrendParamsSchema = Type.Object({ petId: Type.Number() });
export type WaterTrendParamsDTO = Static<typeof WaterTrendParamsSchema>;

export const WaterTrendQuerySchema = Type.Object({
  days: Type.Optional(Type.Number({ minimum: 1 })),
  timezone: Type.Optional(Type.String()),
});
export type WaterTrendQueryDTO = Static<typeof WaterTrendQuerySchema>;

export const WaterTrendsResponseSchema = Type.Array(
  Type.Object({
    date: Type.String(),
    amount: Type.Number(),
    tracked: Type.Boolean(),
    lowerBound: Type.Number(),
    upperBound: Type.Number(),
    averageWeight: Type.Number(),
  }),
);
export type WaterTrendsResponseDTO = Static<typeof WaterTrendsResponseSchema>;

// Litterbox trends
export const LitterboxTrendParamsSchema = Type.Object({ petId: Type.Number() });
export type LitterboxTrendParamsDTO = Static<typeof LitterboxTrendParamsSchema>;

export const LitterboxTrendQuerySchema = Type.Object({
  startTime: Type.String({ format: "date-time" }),
  endTime: Type.String({ format: "date-time" }),
  timezone: Type.Optional(Type.String()),
  detail: Type.Optional(Type.Boolean()),
});
export type LitterboxTrendQueryDTO = Static<typeof LitterboxTrendQuerySchema>;

const LitterboxTrendEventSchema = Type.Object({
  type: LitterboxUseEliminationTypeSchema,
  timestamp: Type.String(),
  straining: Type.Optional(Type.Boolean()),
  id: Type.Optional(Type.Number()),
  duration: Type.Optional(Type.Number()),
  elimination_weight: Type.Optional(Type.Number()),
  human_verified: Type.Optional(Type.Boolean()),
  device_id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  bout_durations: Type.Optional(
    Type.Object({
      urination: Type.Optional(Type.Number()),
      defecation: Type.Optional(Type.Number()),
    }),
  ),
});

const LitterboxDailySummarySchema = Type.Object({
  urinationCount: Type.Number(),
  defecationCount: Type.Number(),
  bothCount: Type.Number(),
  noEliminationCount: Type.Number(),
  unknownCount: Type.Number(),
  strainingCount: Type.Number(),
  totalEliminationWeight: Type.Number(),
  avgEliminationWeight: Type.Union([Type.Number(), Type.Null()]),
  medianEliminationWeight: Type.Union([Type.Number(), Type.Null()]),
  avgDuration: Type.Union([Type.Number(), Type.Null()]),
  medianDuration: Type.Union([Type.Number(), Type.Null()]),
  maxDuration: Type.Union([Type.Number(), Type.Null()]),
});
export type LitterboxDailySummaryDTO = Static<typeof LitterboxDailySummarySchema>;

const LitterboxChartPointSchema = Type.Object({
  timestamp: Type.String(),
  value: Type.Number(),
  eventId: Type.Optional(Type.Number()),
  straining: Type.Optional(Type.Boolean()),
});
export type LitterboxChartPointDTO = Static<typeof LitterboxChartPointSchema>;

const LitterboxDailyCountPointSchema = Type.Object({
  date: Type.String(),
  value: Type.Number(),
});
export type LitterboxDailyCountPointDTO = Static<typeof LitterboxDailyCountPointSchema>;

const LitterboxTrendAnalyticsSchema = Type.Object({
  dailyUrinationCount: Type.Array(LitterboxDailyCountPointSchema),
  dailyDefecationCount: Type.Array(LitterboxDailyCountPointSchema),
  urinationDurationPoints: Type.Array(LitterboxChartPointSchema),
  defecationDurationPoints: Type.Array(LitterboxChartPointSchema),
  urinationWeightPoints: Type.Array(LitterboxChartPointSchema),
  defecationWeightPoints: Type.Array(LitterboxChartPointSchema),
  combinedEliminationWeightPoints: Type.Array(LitterboxChartPointSchema),
});
export type LitterboxTrendAnalyticsDTO = Static<typeof LitterboxTrendAnalyticsSchema>;

export const LitterboxTrendsResponseSchema = Type.Object({
  days: Type.Array(
    Type.Object({
      date: Type.String(),
      events: Type.Array(LitterboxTrendEventSchema),
      summary: Type.Optional(LitterboxDailySummarySchema),
    }),
  ),
  lastPee: Type.Union([Type.String(), Type.Null()]),
  lastPoop: Type.Union([Type.String(), Type.Null()]),
  analytics: Type.Optional(LitterboxTrendAnalyticsSchema),
});
export type LitterboxTrendsResponseDTO = Static<typeof LitterboxTrendsResponseSchema>;
