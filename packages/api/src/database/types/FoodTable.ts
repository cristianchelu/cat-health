import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export type FoodType =
  | 'drink'           // Flavoured water (complementary)
  | 'complete_wet'    // Complete wet food
  | 'complementary_wet' // Complementary wet food
  | 'treat'           // Treats (e.g. sticks)
  | 'complete_dry'    // Complete dry food
  | 'complementary_dry'; // Complementary dry food

export interface FoodTable {
  id: Generated<number>;
  name: string;
  brand: string | null;
  food_type: FoodType;
  barcode_ean13: string | null;
  moisture_percent: number | null;
  calories_per_100g: number | null;
  nutrients: Record<string, number> | null;
  serving_size_g: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export type Food = Selectable<FoodTable>;
export type NewFood = Insertable<FoodTable>;
export type FoodUpdate = Updateable<FoodTable>;
