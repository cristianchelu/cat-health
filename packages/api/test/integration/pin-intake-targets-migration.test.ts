import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { up } from '../../src/database/migrations/202611101400_pin_intake_targets.ts';
import { insertPet } from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('pinning pets to the default plan', () => {
  let ctx: TestDbContext;
  let unpinnedPetId: number;
  let petWithFoodTargetId: number;

  // `createTestDb` has already run the migration on an empty database, so
  // these pets stand for the ones that existed before it.
  before(async () => {
    ctx = await createTestDb();
    unpinnedPetId = (await insertPet(ctx.db, { name: 'Unpinned' })).id;
    petWithFoodTargetId = (await insertPet(ctx.db, { name: 'Has a band' })).id;
    await ctx.db
      .insertInto('event')
      .values({
        pet_id: petWithFoodTargetId,
        caused_by: 'pet',
        attributed_by: 'manual',
        device_id: null,
        parent_event_id: null,
        timestamp: new Date('2026-11-01T10:00:00.000Z'),
        data: {
          type: 'intake_target',
          kind: 'food',
          measure: 'amount',
          tracked: true,
          plan: ['aaha-2021'],
          setting: { target: 200, tolerance: 10 },
        },
        raw_data: null,
        human_verified: true,
      })
      .execute();
    await up(ctx.db);
  });

  after(async () => {
    await destroyTestDb(ctx);
  });

  async function targetsOf(petId: number) {
    const rows = await ctx.db
      .selectFrom('event')
      .select(['data', 'attributed_by', 'recorded_at', 'timestamp'])
      .where('pet_id', '=', petId)
      .where('type', '=', 'intake_target')
      .orderBy('id', 'asc')
      .execute();
    return rows.map((row) => ({
      ...row,
      data: row.data.type === 'intake_target' ? row.data : null,
    }));
  }

  it('gives a pet with no targets one for food and one for water', async () => {
    const kinds = (await targetsOf(unpinnedPetId)).map((t) => t.data?.kind);
    assert.deepEqual(kinds, ['food', 'water']);
  });

  it('pins food on Maintain under the plan of the day', async () => {
    const [food] = await targetsOf(unpinnedPetId);
    assert.deepEqual(food.data, {
      type: 'intake_target',
      kind: 'food',
      measure: 'amount',
      tracked: true,
      plan: ['fediaf-2025', 'aaha-2021'],
      setting: { preset: 'maintain' },
    });
  });

  it('pins water on Normal under the plan of the day', async () => {
    const [, water] = await targetsOf(unpinnedPetId);
    assert.deepEqual(water.data, {
      type: 'intake_target',
      kind: 'water',
      measure: 'amount',
      tracked: true,
      plan: ['kosmal-2025'],
      setting: { preset: 'normal' },
    });
  });

  it('marks a pin as written by the app, at the moment it took effect', async () => {
    const [food] = await targetsOf(unpinnedPetId);
    assert.equal(food.attributed_by, null);
    assert.deepEqual(food.recorded_at, food.timestamp);
  });

  it('leaves a band the owner already set and adds only the missing kind', async () => {
    const targets = await targetsOf(petWithFoodTargetId);
    assert.deepEqual(
      targets.map((t) => [t.data?.kind, t.attributed_by]),
      [
        ['food', 'manual'],
        ['water', null],
      ],
    );
  });

  it('adds nothing when it runs again', async () => {
    await up(ctx.db);
    assert.equal((await targetsOf(unpinnedPetId)).length, 2);
  });
});
