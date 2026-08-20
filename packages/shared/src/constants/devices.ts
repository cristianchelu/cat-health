import { type Static, Type } from '@fastify/type-provider-typebox';

export const DeviceTypeSchema = Type.Union([
  Type.Literal('litterbox'),
  Type.Literal('feeder'),
  Type.Literal('water_fountain'),
  Type.Literal('camera'),
  Type.Literal('pet_recognizer'),
]);
export type DeviceType = Static<typeof DeviceTypeSchema>;
