import { Type, type Static } from "@fastify/type-provider-typebox";
import { isRecord } from "../../typeGuards.ts";

/** One food catalog link for a feeder compartment (opaque compartment id). */
export const FeederFoodCompartmentSchema = Type.Object({
  compartment: Type.String(),
  food_id: Type.Union([Type.Number(), Type.Null()]),
});
export type FeederFoodCompartmentDTO = Static<
  typeof FeederFoodCompartmentSchema
>;

export const FeederFoodCompartmentsSchema = Type.Array(
  FeederFoodCompartmentSchema,
);
export type FeederFoodCompartmentsDTO = Static<
  typeof FeederFoodCompartmentsSchema
>;

/** Parse `device.config.food_compartments` into compartment id → food id. */
export function parseFeederFoodCompartments(
  config: unknown,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!isRecord(config)) return result;

  const raw = config.food_compartments;
  if (!Array.isArray(raw)) return result;

  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const compartment = entry.compartment;
    const foodId = entry.food_id;
    if (typeof compartment !== "string" || compartment.length === 0) continue;
    if (typeof foodId !== "number" || !Number.isFinite(foodId)) continue;
    result.set(compartment, foodId);
  }

  return result;
}

/** Build `food_compartments` array for PATCH, preserving order of known ids. */
export function buildFeederFoodCompartmentsPayload(
  assignments: Array<{ compartment: string; food_id: number | null }>,
): FeederFoodCompartmentsDTO {
  return assignments.map((row) => ({
    compartment: row.compartment,
    food_id: row.food_id,
  }));
}
