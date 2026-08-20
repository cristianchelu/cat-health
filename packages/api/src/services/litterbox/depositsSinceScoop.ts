import { sql, type Kysely } from 'kysely';
import type { SignalPipTone } from 'shared';
import type { Database } from '../../database/index.ts';

/**
 * Deposits accumulated in a litterbox since it was last emptied.
 *
 * No device reports this: a box knows its own waste weight but not what kind of
 * visits produced it. The counter comes from the event log instead, which makes
 * it device-type domain logic rather than provider logic, and keeps it working
 * for any litterbox whose visits we record.
 */

/** Maintenance that empties or replaces the litter, resetting the count. */
const RESETTING_MAINTENANCE = ['scoop', 'deep_clean', 'litter_change'] as const;

/**
 * How far back a count may reach.
 *
 * A box with no recorded scoop has no lower bound, and without one the query
 * walks its entire visit history on every dashboard load. The window also
 * costs nothing in meaning: the pip track holds eight deposits, so a box
 * untouched for two weeks reads the same either way.
 */
const LOOKBACK_DAYS = 14;

/** A visit with no elimination leaves no deposit. */
const DEPOSIT_TYPES: Record<string, SignalPipTone> = {
  urination: 'urination',
  defecation: 'defecation',
  both: 'both',
  unknown: 'unknown',
};

export interface DepositsSinceScoop {
  /** Deposit kinds in visit order, oldest first. */
  pips: SignalPipTone[];
  /** Summed elimination weight in grams. */
  weight: number;
}

/**
 * Two bounded scans, grouped in memory.
 *
 * Deliberately not one query with a correlated subquery for the last scoop:
 * SQLite re-runs a correlated subquery per candidate row, so that shape scans
 * the event table once per visit and blocks the process — better-sqlite3 is
 * synchronous, so a slow query here stalls every route. Both statements below
 * are range scans over `idx_event_device_timestamp`.
 */
export async function getDepositsSinceScoop(
  db: Kysely<Database>,
  deviceIds: readonly number[],
): Promise<Map<number, DepositsSinceScoop>> {
  const result = new Map<number, DepositsSinceScoop>();
  if (deviceIds.length === 0) {
    return result;
  }

  const ids = [...deviceIds];
  const floor = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [resets, visits] = await Promise.all([
    db
      .selectFrom('event')
      .select(({ fn }) => [
        'device_id',
        fn.max('timestamp').as('last_reset_at'),
      ])
      .where('device_id', 'in', ids)
      .where('timestamp', '>=', floor)
      .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_maintenance')
      .where(sql`json_extract(data, '$.maintenance_type')`, 'in', [
        ...RESETTING_MAINTENANCE,
      ])
      .groupBy('device_id')
      .execute(),

    db
      .selectFrom('event')
      .select([
        'device_id',
        'timestamp',
        sql<string | null>`json_extract(data, '$.elimination_type')`.as(
          'elimination_type',
        ),
        sql<number | null>`json_extract(data, '$.elimination_weight')`.as(
          'elimination_weight',
        ),
      ])
      .where('device_id', 'in', ids)
      .where('timestamp', '>=', floor)
      .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_use')
      .orderBy('timestamp', 'asc')
      .execute(),
  ]);

  const resetAt = new Map<number, number>();
  for (const row of resets) {
    if (row.device_id == null || row.last_reset_at == null) continue;
    resetAt.set(row.device_id, new Date(row.last_reset_at).getTime());
  }

  for (const visit of visits) {
    if (visit.device_id == null) continue;

    const since = resetAt.get(visit.device_id);
    if (since != null && new Date(visit.timestamp).getTime() <= since) {
      continue;
    }

    const pip = visit.elimination_type
      ? DEPOSIT_TYPES[visit.elimination_type]
      : undefined;
    if (!pip) continue;

    const entry = result.get(visit.device_id) ?? { pips: [], weight: 0 };
    entry.pips.push(pip);
    entry.weight += visit.elimination_weight ?? 0;
    result.set(visit.device_id, entry);
  }

  return result;
}
