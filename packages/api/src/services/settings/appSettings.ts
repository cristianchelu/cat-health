import type { Kysely } from 'kysely';
import {
  DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES,
  TRACKING_GAP_THRESHOLD_MINUTES_KEY,
} from 'shared';
import type { Database } from '../../database/index.ts';

export async function getAppSetting(
  db: Kysely<Database>,
  key: string,
): Promise<string | null> {
  const row = await db
    .selectFrom('app_setting')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst();

  return row?.value ?? null;
}

export async function setAppSetting(
  db: Kysely<Database>,
  key: string,
  value: string,
): Promise<void> {
  await db
    .insertInto('app_setting')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute();
}

export async function getTrackingGapThresholdMinutes(
  db: Kysely<Database>,
): Promise<number> {
  const raw = await getAppSetting(db, TRACKING_GAP_THRESHOLD_MINUTES_KEY);
  if (raw == null) {
    return DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES;
  }

  return parsed;
}

export async function setTrackingGapThresholdMinutes(
  db: Kysely<Database>,
  minutes: number,
): Promise<void> {
  await setAppSetting(
    db,
    TRACKING_GAP_THRESHOLD_MINUTES_KEY,
    String(minutes),
  );
}
