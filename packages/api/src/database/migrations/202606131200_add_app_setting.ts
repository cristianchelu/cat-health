import { Kysely } from 'kysely';

export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema
    .createTable('app_setting')
    .addColumn('key', 'text', (col) => col.primaryKey())
    .addColumn('value', 'text', (col) => col.notNull())
    .execute();

  await db
    .insertInto('app_setting' as never)
    .values({
      key: 'tracking_gap_threshold_minutes',
      value: '360',
    } as never)
    .execute();
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema.dropTable('app_setting').execute();
}
