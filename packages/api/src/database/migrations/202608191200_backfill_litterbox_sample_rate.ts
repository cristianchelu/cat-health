import { Kysely, sql } from 'kysely';

/**
 * Frozen v1 raw_data header parse (do not swap for the live decoder — a
 * migration must keep reading the format as it existed when written):
 * byte 0 = version, u32 sample count at offset 19, i16 samples from 23.
 */
function v1SampleCount(rawData: unknown): number | null {
  if (!(rawData instanceof Uint8Array) || rawData.length < 23) return null;
  if (rawData[0] !== 1) return null;
  const view = new DataView(
    rawData.buffer,
    rawData.byteOffset,
    rawData.byteLength,
  );
  const headerCount = view.getUint32(19);
  return Math.min(headerCount, Math.floor((rawData.length - 23) / 2));
}

export async function up(db: Kysely<any>): Promise<void> {
  const rows = await db
    .selectFrom('event')
    .select(['id', 'raw_data'])
    .select(sql<number | null>`json_extract(data, '$.duration')`.as('duration'))
    .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_use')
    .where(sql`json_extract(data, '$.sample_rate_hz')`, 'is', null)
    .where('raw_data', 'is not', null)
    .execute();

  for (const row of rows) {
    const count = v1SampleCount(row.raw_data);
    const duration = row.duration;
    if (count === null || count < 2 || !duration || duration <= 0) continue;

    const rate = Math.round(((count - 1) / duration) * 1000) / 1000;
    await db
      .updateTable('event')
      .set({ data: sql`json_set(data, '$.sample_rate_hz', ${rate})` })
      .where('id', '=', row.id)
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('event')
    .set({ data: sql`json_remove(data, '$.sample_rate_hz')` })
    .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_use')
    .execute();
}
