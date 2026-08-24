import { Kysely } from 'kysely';

export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  const existing = await db
    .selectFrom('provider_account' as never)
    .select('id' as never)
    .where('provider' as never, '=', 'thingino' as never)
    .where('internal' as never, '=', 1 as never)
    .executeTakeFirst();
  if (existing) return;

  const now = Date.now();
  await db
    .insertInto('provider_account' as never)
    .values({
      provider: 'thingino',
      name: 'Thingino',
      config: {},
      runtime_state: {},
      enabled: 1,
      internal: 1,
      created_at: now,
      updated_at: now,
    } as never)
    .execute();
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db
    .deleteFrom('provider_account' as never)
    .where('provider' as never, '=', 'thingino' as never)
    .where('internal' as never, '=', 1 as never)
    .execute();
}
