import { Kysely } from 'kysely';

/**
 * Rename `food.barcode_ean13` to `food.barcode`: the column holds any GTIN a
 * pack prints (EAN-8, UPC-A, EAN-13, GTIN-14), not only EAN-13. No index or
 * CHECK names the column, so SQLite renames it in place.
 */
export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema
    .alterTable('food')
    .renameColumn('barcode_ean13', 'barcode')
    .execute();
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema
    .alterTable('food')
    .renameColumn('barcode', 'barcode_ean13')
    .execute();
}
