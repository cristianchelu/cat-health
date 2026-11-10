import { Kysely, sql } from 'kysely';

/**
 * Pins every pet to the default plan of the day: one food and one water
 * `intake_target` event, on the first notches. From here on a pet resolves
 * against her own snapshots, so a later change to the defaults does not reach
 * her. The plans are spelled out because a migration records what was true
 * when it ran.
 */
const FOOD_TARGET = {
  type: 'intake_target',
  kind: 'food',
  measure: 'amount',
  tracked: true,
  plan: ['fediaf-2025', 'aaha-2021'],
  setting: { preset: 'maintain' },
};

const WATER_TARGET = {
  type: 'intake_target',
  kind: 'water',
  measure: 'amount',
  tracked: true,
  plan: ['kosmal-2025'],
  setting: { preset: 'normal' },
};

export async function up<DB>(db: Kysely<DB>): Promise<void> {
  const now = new Date().toISOString();
  await pinPetsWithout(db, 'food', JSON.stringify(FOOD_TARGET), now);
  await pinPetsWithout(db, 'water', JSON.stringify(WATER_TARGET), now);
}

export async function down<DB>(db: Kysely<DB>): Promise<void> {
  await sql`
    DELETE FROM event
    WHERE type = 'intake_target' AND attributed_by IS NULL
  `.execute(db);
}

/** One target event at `now` for each pet that has none of that kind, so a second run adds nothing. */
async function pinPetsWithout<DB>(
  db: Kysely<DB>,
  kind: 'food' | 'water',
  data: string,
  now: string,
): Promise<void> {
  await sql`
    INSERT INTO event (
      pet_id, caused_by, attributed_by, device_id, parent_event_id,
      timestamp, recorded_at, data, raw_data, human_verified
    )
    SELECT pet.id, 'pet', NULL, NULL, NULL, ${now}, ${now}, ${data}, NULL, 'false'
    FROM pet
    WHERE NOT EXISTS (
      SELECT 1 FROM event
      WHERE event.pet_id = pet.id
        AND event.type = 'intake_target'
        AND json_extract(event.data, '$.kind') = ${kind}
    )
  `.execute(db);
}
