import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('event')
    .set({
      data: sql`json_set(data, '$.duration', CAST(ROUND(json_extract(data, '$.duration') / 1000.0) AS INTEGER))`,
    })
    .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_use')
    .where(sql`json_extract(data, '$.duration')`, 'is not', null)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('event')
    .set({
      data: sql`json_set(data, '$.duration', CAST(json_extract(data, '$.duration') * 1000 AS INTEGER))`,
    })
    .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_use')
    .where(sql`json_extract(data, '$.duration')`, 'is not', null)
    .execute();
}
