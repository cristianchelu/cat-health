import { Type, type Static } from "@fastify/type-provider-typebox";
import { parseWithSchema } from "../runtimeSchema.ts";

export const FoodTypeSchema = Type.Union([
  Type.Literal("drink"),
  Type.Literal("complete_wet"),
  Type.Literal("complementary_wet"),
  Type.Literal("treat"),
  Type.Literal("complete_dry"),
  Type.Literal("complementary_dry"),
]);
export type FoodTypeDTO = Static<typeof FoodTypeSchema>;

export const BarcodeEan13Schema = Type.Union([
  Type.Null(),
  Type.String({ minLength: 13, maxLength: 13, pattern: "^[0-9]{13}$" }),
]);
export type BarcodeEan13DTO = Static<typeof BarcodeEan13Schema>;

export const NutrientNameSchema = Type.Union([
  Type.Literal("protein"),
  Type.Literal("fat"),
  Type.Literal("fiber"),
  Type.Literal("ash"),
  Type.Literal("carbs"),
  Type.Literal("calcium"),
  Type.Literal("phosphorus"),
  Type.Literal("taurine"),
  Type.Literal("sodium"),
  Type.Literal("omega3"),
  Type.Literal("omega6"),
]);
export type NutrientNameDTO = Static<typeof NutrientNameSchema>;

export const NutrientUnitSchema = Type.Union([
  Type.Literal("percent"),
  Type.Literal("g"),
  Type.Literal("mg"),
]);
export type NutrientUnitDTO = Static<typeof NutrientUnitSchema>;

const FoodNutrientItemSchema = Type.Object({
  nutrient: NutrientNameSchema,
  unit: NutrientUnitSchema,
  value: Type.Number(),
});
export const FoodNutrientsSchema = Type.Array(FoodNutrientItemSchema);
export type FoodNutrientsDTO = Static<typeof FoodNutrientsSchema>;

/** Parse nutrients from a DB JSON column or request body. */
export function parseFoodNutrients(raw: unknown): FoodNutrientsDTO | null {
  if (raw === null || raw === undefined) return null;
  return parseWithSchema(FoodNutrientsSchema, raw) ?? null;
}

export const GetFoodParamsSchema = Type.Object({ id: Type.Number() });
export type GetFoodParamsDTO = Static<typeof GetFoodParamsSchema>;

export const GetFoodSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  brand: Type.Union([Type.String(), Type.Null()]),
  food_type: FoodTypeSchema,
  barcode_ean13: Type.Union([Type.String(), Type.Null()]),
  moisture_percent: Type.Union([Type.Number(), Type.Null()]),
  calories_per_100g: Type.Union([Type.Number(), Type.Null()]),
  nutrients: Type.Union([FoodNutrientsSchema, Type.Null()]),
  serving_size_g: Type.Union([Type.Number(), Type.Null()]),
  notes: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.Number(),
  updated_at: Type.Number(),
});
export type GetFoodDTO = Static<typeof GetFoodSchema>;

export const GetFoodsResponseSchema = Type.Array(GetFoodSchema);
export type GetFoodsResponseDTO = Static<typeof GetFoodsResponseSchema>;

export const PostFoodRequestSchema = Type.Object({
  name: Type.String(),
  brand: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  food_type: FoodTypeSchema,
  barcode_ean13: Type.Optional(
    Type.Union([
      Type.Null(),
      Type.String({ minLength: 13, maxLength: 13, pattern: "^[0-9]{13}$" }),
    ]),
  ),
  moisture_percent: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  calories_per_100g: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  nutrients: Type.Optional(Type.Union([FoodNutrientsSchema, Type.Null()])),
  serving_size_g: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type PostFoodRequestDTO = Static<typeof PostFoodRequestSchema>;

export const PatchFoodRequestSchema = Type.Partial(PostFoodRequestSchema);
export type PatchFoodRequestDTO = Static<typeof PatchFoodRequestSchema>;

export const DeleteFoodParamsSchema = Type.Object({ id: Type.Number() });
export type DeleteFoodParamsDTO = Static<typeof DeleteFoodParamsSchema>;

export const DeleteFoodResponseSchema = Type.Object({
  success: Type.Boolean(),
});
export type DeleteFoodResponseDTO = Static<typeof DeleteFoodResponseSchema>;
