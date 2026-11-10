import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sql } from 'kysely';

import { insertPet, insertPetPresenceEvent } from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('event columns', () => {
  let ctx: TestDbContext;
  let eventId: number;

  before(async () => {
    ctx = await createTestDb();
    const pet = await insertPet(ctx.db, {
      name: 'Column Cat',
      breed: 'Siamese',
      birth_date: new Date('2018-03-20'),
    });
    await insertPetPresenceEvent(ctx.db, {
      pet_id: pet.id,
      state: 'away',
      context: 'vet',
      previous_state: 'home',
    });
    const event = await ctx.db
      .selectFrom('event')
      .select('id')
      .where('pet_id', '=', pet.id)
      .executeTakeFirstOrThrow();
    eventId = event.id;
  });

  after(async () => {
    await destroyTestDb(ctx);
  });

  async function readEvent() {
    return ctx.db
      .selectFrom('event')
      .select(['type', 'recorded_at', 'timestamp_precision'])
      .where('id', '=', eventId)
      .executeTakeFirstOrThrow();
  }

  it('mirrors the payload type in the type column', async () => {
    assert.equal((await readEvent()).type, 'pet_presence');
  });

  it('leaves the written time and precision null unless a writer sets them', async () => {
    const event = await readEvent();
    assert.deepEqual(
      [event.recorded_at, event.timestamp_precision],
      [null, null],
    );
  });

  it('keeps the time a row was written', async () => {
    const recordedAt = new Date('2026-11-10T09:00:00.000Z');
    await ctx.db
      .updateTable('event')
      .set({ recorded_at: recordedAt })
      .where('id', '=', eventId)
      .execute();
    assert.deepEqual((await readEvent()).recorded_at, recordedAt);
  });

  it('keeps how exact a timestamp is', async () => {
    await ctx.db
      .updateTable('event')
      .set({ timestamp_precision: 'year' })
      .where('id', '=', eventId)
      .execute();
    assert.equal((await readEvent()).timestamp_precision, 'year');
  });

  // Raw SQL, because the column's TypeScript type already refuses the value.
  it('refuses a precision outside the known ones', async () => {
    await assert.rejects(
      sql`UPDATE event SET timestamp_precision = 'week' WHERE id = ${eventId}`.execute(
        ctx.db,
      ),
      /CHECK constraint failed/,
    );
  });
});
