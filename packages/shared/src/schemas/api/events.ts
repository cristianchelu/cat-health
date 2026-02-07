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

export const PostEventRequestSchema = Type.Evaluate(
  Type.Intersect([
    Type.Omit(GetEventSchema, ["id", "timestamp", "raw_data"]),
    Type.Object({
      timestamp: Type.Optional(Type.String()),
      raw_data: Type.Optional(
        Type.Union([Type.Null(), Type.Array(Type.Number())]),
      ),
      parent_event_id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    }),
  ]),
);
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
  endTime: Type.Optional(Type.String({ format: "date-time" })), // ISO 8601 format
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 5000 })),
  offset: Type.Optional(Type.Number({ minimum: 0 })),
  includeChildren: Type.Optional(Type.Boolean()),
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
  days: Type.Optional(Type.Number({ minimum: 1 })),
  timezone: Type.Optional(Type.String()),
});
export type LitterboxTrendQueryDTO = Static<typeof LitterboxTrendQuerySchema>;

export const LitterboxTrendsResponseSchema = Type.Object({
  days: Type.Array(
    Type.Object({
      date: Type.String(),
      events: Type.Array(
        Type.Object({
          type: LitterboxUseEliminationTypeSchema,
          timestamp: Type.String(),
        }),
      ),
    }),
  ),
  lastPee: Type.Union([Type.String(), Type.Null()]),
  lastPoop: Type.Union([Type.String(), Type.Null()]),
});
export type LitterboxTrendsResponseDTO = Static<typeof LitterboxTrendsResponseSchema>;
