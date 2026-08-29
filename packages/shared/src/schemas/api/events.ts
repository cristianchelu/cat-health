import { Type, type Static } from '@fastify/type-provider-typebox';
import { getPaginatedResponseSchema } from './common.ts';
import {
  EventDataSchema,
  EventTypeSchema,
  LitterboxUseEliminationTypeSchema,
  type LitterboxAnalysisStatePeriodDTO,
} from './eventData.ts';

/**
 * Legacy fallback rate (Hz) only — real hardware pushes ~7.3Hz. Prefer the
 * visit's persisted `data.sample_rate_hz`, or `deriveLitterboxSampleRateHz`
 * over decoded raw_data; reach for this constant only when both are absent.
 */
export const LITTERBOX_SAMPLE_HZ = 10;

/** Longest note the API accepts. A paragraph about one visit, not a journal. */
export const EVENT_NOTE_MAX_LENGTH = 2000;

/**
 * One row from server `StateAnalyzer` periods, persisted on the event as `data.segments`.
 * Sample indices `start` / `end` align with the weight array; convert to seconds with the
 * visit's `data.sample_rate_hz` (falling back to `LITTERBOX_SAMPLE_HZ`).
 * Per-interval stats (variance, mean) are not persisted — UIs that need them recompute from `raw_data` weights.
 */
export type LitterboxAnalysisStatePeriod = LitterboxAnalysisStatePeriodDTO;

/**
 * What caused the event.
 *
 * `unknown` is the unresolved state — it wants a human, and it is what the
 * review queue selects on. Every other value is a decision someone or something
 * already made. `pet` says an animal of ours did it; `pet_id` then names which,
 * or stays null when we know it was a pet but not which one.
 *
 * The remaining values say the event happened without a pet, by naming what did
 * it rather than what it wasn't — the robot vacuum knocking the fountain, a
 * person refilling a bowl. Only `pet` may carry a `pet_id`; a DB CHECK enforces
 * that and nothing else, so this list can grow without a migration.
 */
export const EventCauseSchema = Type.Union([
  Type.Literal('unknown'),
  Type.Literal('pet'),
  Type.Literal('robot_vacuum'),
  Type.Literal('human'),
  Type.Literal('other_animal'),
  Type.Literal('environment'),
]);
export type EventCauseDTO = Static<typeof EventCauseSchema>;

/** Causes that mean no pet of ours was involved — everything but `pet`/`unknown`. */
export const NON_PET_CAUSES = [
  'robot_vacuum',
  'human',
  'other_animal',
  'environment',
] as const satisfies readonly EventCauseDTO[];

/**
 * How the cause was established, in rough order of trust: an RFID chip is not a
 * guess, a weight plateau is. Null when nothing has decided yet.
 *
 * This is the axis `human_verified` currently half-covers. `manual` is the
 * honest version of "a human decided this", uncoupled from "a human edited some
 * other field on this event".
 */
export const EventAttributionSourceSchema = Type.Union([
  Type.Literal('microchip'),
  Type.Literal('recognizer'),
  Type.Literal('weight'),
  Type.Literal('manual'),
]);
export type EventAttributionSourceDTO = Static<
  typeof EventAttributionSourceSchema
>;

const GetEventFieldsSchema = Type.Object({
  id: Type.Number(),
  parent_event_id: Type.Union([Type.Number(), Type.Null()]),
  pet_id: Type.Union([Type.Number(), Type.Null()]),
  caused_by: EventCauseSchema,
  attributed_by: Type.Union([EventAttributionSourceSchema, Type.Null()]),
  device_id: Type.Union([Type.Null(), Type.Number()]),
  timestamp: Type.String({ format: 'date-time' }),
  data: EventDataSchema,
  raw_data: Type.Union([Type.Null(), Type.Array(Type.Number())]),
  human_verified: Type.Boolean(),
  /**
   * The owner's free-text note, or null. The one field on an event surface
   * that is neither measured nor guessed, so it is edited in place rather
   * than through the correction form.
   */
  note: Type.Union([Type.String(), Type.Null()]),
  /** When `note` was last written; null whenever `note` is. */
  note_updated_at: Type.Union([
    Type.String({ format: 'date-time' }),
    Type.Null(),
  ]),
});

export const GetEventSchema = GetEventFieldsSchema;
export type GetEventDTO = Static<typeof GetEventSchema>;

/**
 * List row on GET /events — everything but `raw_data`. Sensor blobs (litterbox
 * v2 is ~6 bytes/sample, serialized as a JSON number[]) would dominate list
 * payloads; views that decode the signal fetch the single event by id instead.
 */
export const GetEventListItemSchema = Type.Omit(GetEventFieldsSchema, [
  'raw_data',
]);
export type GetEventListItemDTO = Static<typeof GetEventListItemSchema>;

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

export const GetEventsSchema = Type.Array(GetEventListItemSchema);
export type GetEventsDTO = Static<typeof GetEventsSchema>;

export const PostEventRequestSchema = Type.Intersect([
  Type.Omit(GetEventSchema, [
    'id',
    'timestamp',
    'raw_data',
    'caused_by',
    'attributed_by',
    'note',
    'note_updated_at',
  ]),
  Type.Object({
    timestamp: Type.Optional(Type.String({ format: 'date-time' })),
    /** Omit to let `pet_id` speak: a pet if present, otherwise unresolved. */
    caused_by: Type.Optional(EventCauseSchema),
    attributed_by: Type.Optional(EventAttributionSourceSchema),
    /** `note_updated_at` is never accepted from a client — the server stamps it. */
    note: Type.Optional(
      Type.Union([
        Type.String({ maxLength: EVENT_NOTE_MAX_LENGTH }),
        Type.Null(),
      ]),
    ),
  }),
]);
export type PostEventRequestDTO = Static<typeof PostEventRequestSchema>;

export const PatchEventParamsSchema = Type.Object({ eventId: Type.Number() });
export type PatchEventParamsDTO = Static<typeof PatchEventParamsSchema>;

export const PatchEventRequestSchema = Type.Object({
  pet_id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  /** A non-pet cause clears `pet_id`; a `pet_id` in the same body implies `pet`. */
  caused_by: Type.Optional(EventCauseSchema),
  attributed_by: Type.Optional(EventAttributionSourceSchema),
  data: Type.Optional(EventDataSchema),
  human_verified: Type.Optional(Type.Boolean()),
  /**
   * Write or clear the note. An empty string clears it, same as `null` — the
   * UI's "delete everything you typed and save" is the same intent as the
   * clear action, and one stored representation keeps `note_updated_at`
   * honest.
   */
  note: Type.Optional(
    Type.Union([
      Type.String({ maxLength: EVENT_NOTE_MAX_LENGTH }),
      Type.Null(),
    ]),
  ),
});
export type PatchEventRequestDTO = Static<typeof PatchEventRequestSchema>;

export const GetEventsQuerySchema = Type.Object({
  pet_id: Type.Optional(Type.Number()),
  /** `unknown` is the "needs a human" queue. */
  caused_by: Type.Optional(EventCauseSchema),
  attributed_by: Type.Optional(EventAttributionSourceSchema),
  device_id: Type.Optional(Type.Number()),
  startTime: Type.Optional(Type.String({ format: 'date-time' })), // ISO 8601 format
  endTime: Type.Optional(Type.String({ format: 'date-time' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 5000 })),
  offset: Type.Optional(Type.Number({ minimum: 0 })),
  includeChildren: Type.Optional(Type.Boolean()),
  human_verified: Type.Optional(Type.Boolean()),
  /** Filters on `data.type` — e.g. `food_intake` for the log flow's recents. */
  eventType: Type.Optional(EventTypeSchema),
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
  start: Type.String({ format: 'date-time' }),
  end: Type.String({ format: 'date-time' }),
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
  rangeStart: Type.String({ format: 'date-time' }),
  rangeEnd: Type.String({ format: 'date-time' }),
  todayTracked: Type.Boolean(),
});
export type WeightTrendsResponseDTO = Static<typeof WeightTrendsResponseSchema>;

/** Timeline badge row: seconds from sample indices; `elimination_type` comes from persisted segments. */
export interface LitterboxEliminationBadgeSegment {
  elimination_type: 'urination' | 'defecation';
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
  startTime: Type.String({ format: 'date-time' }),
  endTime: Type.String({ format: 'date-time' }),
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
