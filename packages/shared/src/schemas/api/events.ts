import { Type, type Static } from "@fastify/type-provider-typebox";
import { getPaginatedResponseSchema } from "./common.ts";

export const GetEventSchema = Type.Object({
  id: Type.Number(),
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

export const PostEventRequestSchema = Type.Composite([
  Type.Omit(GetEventSchema, ["id", "timestamp", "raw_data"]),
  Type.Object({
    timestamp: Type.Optional(Type.String()),
    raw_data: Type.Optional(
      Type.Union([Type.Null(), Type.Array(Type.Number())]),
    ),
  }),
]);
export type PostEventRequestDTO = Static<typeof PostEventRequestSchema>;

export const PatchEventParamsSchema = Type.Object({ eventId: Type.Number() });
export type PatchEventParamsDTO = Static<typeof PatchEventParamsSchema>;

export const PatchEventRequestSchema = Type.Object({
  pet_id: Type.Union([Type.Number(), Type.Null()]),
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
