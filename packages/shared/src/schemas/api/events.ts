import { Type, type Static } from "@fastify/type-provider-typebox";
import { getPaginatedResponseSchema } from "./common.ts";
import {
  EventDataSchema,
  LitterboxUseEliminationTypeSchema,
  type LitterboxAnalysisStatePeriodDTO,
} from "./eventData.ts";

/** Sample rate (Hz); must match `StateAnalyzer` on the device path. */
export const LITTERBOX_SAMPLE_HZ = 10;

/**
 * One row from server `StateAnalyzer` periods, persisted on the event as `data.segments`.
 * Sample indices `start` / `end` align with the weight array; use `LITTERBOX_SAMPLE_HZ` (or derived Hz from duration/length) for seconds in the UI.
 * Per-interval stats (variance, mean) are not persisted — UIs that need them recompute from `raw_data` weights.
 */
export type LitterboxAnalysisStatePeriod = LitterboxAnalysisStatePeriodDTO;

const GetEventFieldsSchema = Type.Object({
  id: Type.Number(),
  parent_event_id: Type.Union([Type.Number(), Type.Null()]),
  pet_id: Type.Union([Type.Number(), Type.Null()]),
  device_id: Type.Union([Type.Null(), Type.Number()]),
  timestamp: Type.String({ format: "date-time" }),
  data: EventDataSchema,
  raw_data: Type.Union([Type.Null(), Type.Array(Type.Number())]),
  human_verified: Type.Boolean(),
});

export const GetEventSchema = GetEventFieldsSchema;
export type GetEventDTO = Static<typeof GetEventSchema>;

/** Child row on GET /events/:id — same shape as parent, no nested children. */
export const GetEventChildSchema = GetEventFieldsSchema;
export type GetEventChildDTO = Static<typeof GetEventChildSchema>;

export const GetEventWithChildrenSchema = Type.Intersect([
  GetEventSchema,
  Type.Object({
    children: Type.Array(GetEventChildSchema),
  }),
]);
export type GetEventWithChildrenDTO = Static<typeof GetEventWithChildrenSchema>;

export const GetEventsSchema = Type.Array(GetEventSchema);
export type GetEventsDTO = Static<typeof GetEventsSchema>;

export const PostEventRequestSchema = Type.Intersect([
  Type.Omit(GetEventSchema, ["id", "timestamp", "raw_data"]),
  Type.Object({
    timestamp: Type.Optional(Type.String({ format: "date-time" })),
  }),
]);
export type PostEventRequestDTO = Static<typeof PostEventRequestSchema>;

export const PatchEventParamsSchema = Type.Object({ eventId: Type.Number() });
export type PatchEventParamsDTO = Static<typeof PatchEventParamsSchema>;

export const PatchEventRequestSchema = Type.Object({
  pet_id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  data: Type.Optional(EventDataSchema),
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

export const UntrackedIntervalSchema = Type.Object({
  start: Type.String({ format: "date-time" }),
  end: Type.String({ format: "date-time" }),
});
export type UntrackedIntervalDTO = Static<typeof UntrackedIntervalSchema>;

export const WeightTrendPointSchema = Type.Object({
  date: Type.String(),
  weight: Type.Number(),
  timestamp: Type.String(),
  tracked: Type.Boolean(),
});
export type WeightTrendPointDTO = Static<typeof WeightTrendPointSchema>;

export const WeightTrendsResponseSchema = Type.Object({
  points: Type.Array(WeightTrendPointSchema),
  untrackedIntervals: Type.Array(UntrackedIntervalSchema),
  untrackedDayIntervals: Type.Array(UntrackedIntervalSchema),
  rangeStart: Type.String({ format: "date-time" }),
  rangeEnd: Type.String({ format: "date-time" }),
  todayTracked: Type.Boolean(),
});
export type WeightTrendsResponseDTO = Static<typeof WeightTrendsResponseSchema>;

/** Timeline badge row: seconds from sample indices; `elimination_type` comes from persisted segments. */
export interface LitterboxEliminationBadgeSegment {
  elimination_type: "urination" | "defecation";
  start_s: number;
  end_s: number;
}

// Water trends
export const WaterTrendParamsSchema = Type.Object({ petId: Type.Number() });
export type WaterTrendParamsDTO = Static<typeof WaterTrendParamsSchema>;

export const WaterTrendQuerySchema = Type.Object({
  days: Type.Optional(Type.Number({ minimum: 1 })),
  timezone: Type.Optional(Type.String()),
});
export type WaterTrendQueryDTO = Static<typeof WaterTrendQuerySchema>;

const DailyMetricTrendDaySchema = Type.Object({
  date: Type.String(),
  amount: Type.Number(),
  tracked: Type.Boolean(),
  lowerBound: Type.Number(),
  upperBound: Type.Number(),
  averageWeight: Type.Number(),
});
export type DailyMetricTrendDayDTO = Static<typeof DailyMetricTrendDaySchema>;

export const WaterTrendsResponseSchema = Type.Array(DailyMetricTrendDaySchema);
export type WaterTrendsResponseDTO = Static<typeof WaterTrendsResponseSchema>;

export const FoodTrendParamsSchema = Type.Object({ petId: Type.Number() });
export type FoodTrendParamsDTO = Static<typeof FoodTrendParamsSchema>;

export const FoodTrendQuerySchema = Type.Object({
  days: Type.Optional(Type.Number({ minimum: 1 })),
  timezone: Type.Optional(Type.String()),
});
export type FoodTrendQueryDTO = Static<typeof FoodTrendQuerySchema>;

export const FoodTrendsResponseSchema = Type.Array(DailyMetricTrendDaySchema);
export type FoodTrendsResponseDTO = Static<typeof FoodTrendsResponseSchema>;

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
export type LitterboxDailySummaryDTO = Static<
  typeof LitterboxDailySummarySchema
>;

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
export type LitterboxDailyCountPointDTO = Static<
  typeof LitterboxDailyCountPointSchema
>;

const LitterboxTrendAnalyticsSchema = Type.Object({
  dailyUrinationCount: Type.Array(LitterboxDailyCountPointSchema),
  dailyDefecationCount: Type.Array(LitterboxDailyCountPointSchema),
  urinationDurationPoints: Type.Array(LitterboxChartPointSchema),
  defecationDurationPoints: Type.Array(LitterboxChartPointSchema),
  urinationWeightPoints: Type.Array(LitterboxChartPointSchema),
  defecationWeightPoints: Type.Array(LitterboxChartPointSchema),
  combinedEliminationWeightPoints: Type.Array(LitterboxChartPointSchema),
});
export type LitterboxTrendAnalyticsDTO = Static<
  typeof LitterboxTrendAnalyticsSchema
>;

export const LitterboxTrendsResponseSchema = Type.Object({
  days: Type.Array(
    Type.Object({
      date: Type.String(),
      tracked: Type.Boolean(),
      events: Type.Array(LitterboxTrendEventSchema),
      summary: Type.Optional(LitterboxDailySummarySchema),
    }),
  ),
  lastPee: Type.Union([Type.String(), Type.Null()]),
  lastPoop: Type.Union([Type.String(), Type.Null()]),
  analytics: Type.Optional(LitterboxTrendAnalyticsSchema),
});
export type LitterboxTrendsResponseDTO = Static<
  typeof LitterboxTrendsResponseSchema
>;
