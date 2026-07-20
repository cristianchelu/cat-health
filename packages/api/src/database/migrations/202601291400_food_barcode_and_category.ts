import { Kysely } from 'kysely';

/**
 * Add barcode_ean13 to food and migrate food_type to expanded categories.
 *
 * New food_type values: drink | complete_wet | complementary_wet | treat | complete_dry | complementary_dry
 * Existing rows: wet -> complete_wet, dry -> complete_dry, treat -> treat
 */
export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema
    .alterTable('food')
    .addColumn('barcode_ean13', 'text')
    .execute();

  // Schema not in Kysely type at migration time; cast needed for updateTable/where
  await db
    .updateTable('food' as any)
    .set({ food_type: 'complete_wet' } as never)
    .where('food_type' as any, '=', 'wet')
    .execute();
  await db
    .updateTable('food' as any)
    .set({ food_type: 'complete_dry' } as never)
    .where('food_type' as any, '=', 'dry')
    .execute();
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db
    .updateTable('food' as never)
    .set({ food_type: 'wet' } as never)
    .where('food_type' as any, 'in', [
      'complete_wet',
      'complementary_wet',
      'drink',
    ])
    .execute();
  await db
    .updateTable('food' as never)
    .set({ food_type: 'dry' } as never)
    .where('food_type' as any, 'in', ['complete_dry', 'complementary_dry'])
    .execute();
  await db.schema.alterTable('food').dropColumn('barcode_ean13').execute();
}
