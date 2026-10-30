import { Type, type Static } from '@fastify/type-provider-typebox';
import { parseWithSchema } from '../runtimeSchema.ts';

export const FoodTypeSchema = Type.Union([
  Type.Literal('drink'),
  Type.Literal('complete_wet'),
  Type.Literal('complementary_wet'),
  Type.Literal('treat'),
  Type.Literal('complete_dry'),
  Type.Literal('complementary_dry'),
]);
export type FoodTypeDTO = Static<typeof FoodTypeSchema>;

/**
 * Digit counts of the GTIN family printed on retail packs: EAN-8 and UPC-E,
 * UPC-A, EAN-13 and GTIN-14. Check digits are not verified, because a UPC-E's
 * is computed over its expanded UPC-A form rather than the printed digits.
 */
const BARCODE_LENGTHS = [8, 12, 13, 14];

const BARCODE_PATTERN = `^(?:${BARCODE_LENGTHS.map((n) => `[0-9]{${n}}`).join('|')})$`;
const BARCODE_REGEX = new RegExp(BARCODE_PATTERN);

export const BarcodeSchema = Type.String({ pattern: BARCODE_PATTERN });

/**
 * The digits of a barcode as typed or scanned, with the spaces and hyphens a
 * pack prints between groups dropped, or null when it is not a barcode.
 */
export function parseBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  return BARCODE_REGEX.test(digits) ? digits : null;
}

/**
 * Whether two barcodes name the same product. They are compared as GTIN-14,
 * so a stored UPC-A matches the zero-led EAN-13 a scanner may read for it.
 */
export function isSameBarcode(a: string, b: string): boolean {
  return a.padStart(14, '0') === b.padStart(14, '0');
}

export const NutrientNameSchema = Type.Union([
  Type.Literal('protein'),
  Type.Literal('fat'),
  Type.Literal('fiber'),
  Type.Literal('ash'),
  Type.Literal('carbs'),
  Type.Literal('calcium'),
  Type.Literal('phosphorus'),
  Type.Literal('taurine'),
  Type.Literal('sodium'),
  Type.Literal('omega3'),
  Type.Literal('omega6'),
]);
export type NutrientNameDTO = Static<typeof NutrientNameSchema>;

export const NutrientUnitSchema = Type.Union([
  Type.Literal('percent'),
  Type.Literal('g'),
  Type.Literal('mg'),
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

/**
 * Nullable number that survives Fastify’s default AJV `coerceTypes`.
 *
 * TypeBox’s idiomatic `Union([Number, Null])` emits `anyOf`, and AJV then
 * coerces JSON `null` → `0`. OpenAPI `{ nullable: true }` avoids that but is
 * non-standard JSON Schema and still needs Unsafe for Static.
 *
 * JSON Schema multi-type `{ type: ['number', 'null'] }` keeps null, still
 * coerces `"5"` → `5`, and distinguishes genuine `0`. Unsafe is required only
 * because TypeBox has no first-class multi-type emitter (same pattern TypeBox
 * docs use for this case).
 */
const NullableNumberSchema = Type.Unsafe<number | null>({
  type: ['number', 'null'],
});

export const GetFoodSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  brand: Type.Union([Type.String(), Type.Null()]),
  food_type: FoodTypeSchema,
  barcode: Type.Union([Type.String(), Type.Null()]),
  moisture_percent: NullableNumberSchema,
  calories_per_100g: NullableNumberSchema,
  nutrients: Type.Union([FoodNutrientsSchema, Type.Null()]),
  serving_size_g: NullableNumberSchema,
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
  barcode: Type.Optional(Type.Union([Type.Null(), BarcodeSchema])),
  moisture_percent: Type.Optional(NullableNumberSchema),
  calories_per_100g: Type.Optional(NullableNumberSchema),
  nutrients: Type.Optional(Type.Union([FoodNutrientsSchema, Type.Null()])),
  serving_size_g: Type.Optional(NullableNumberSchema),
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
