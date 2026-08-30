import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { recordIdentification } from '../../src/services/recognition/identification.ts';
import type { PetIdentificationResult } from '../../src/services/recognition/identification.ts';
import { insertLitterboxEvent, insertPet } from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

const verdict = {
  pet: (id: number, name: string): PetIdentificationResult => ({
    pet_id: id,
    caused_by: 'pet',
    pet_name: name,
    raw_response: name,
  }),
  robotVacuum: (): PetIdentificationResult => ({
    pet_id: null,
    caused_by: 'robot_vacuum',
    pet_name: 'robot_vacuum',
    raw_response: 'robot_vacuum',
  }),
  unknown: (): PetIdentificationResult => ({
    pet_id: null,
    caused_by: 'unknown',
    pet_name: 'unknown',
    raw_response: 'unknown',
  }),
};

describe('recordIdentification', () => {
  let ctx: TestDbContext;
  let petId: number;

  before(async () => {
    ctx = await createTestDb();
    const pet = await insertPet(ctx.db, { name: 'Mochi' });
    petId = pet.id;
  });

  after(async () => {
    await destroyTestDb(ctx);
  });

  const readBack = (id: number) =>
    ctx.db
      .selectFrom('event')
      .select(['pet_id', 'caused_by', 'attributed_by'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

  it('fills in an unresolved event with a pet', async () => {
    const event = await insertLitterboxEvent(ctx.db, { pet_id: null });

    const outcome = await recordIdentification(
      ctx.db,
      event.id,
      verdict.pet(petId, 'Mochi'),
    );

    assert.equal(outcome, 'applied');
    assert.deepEqual(await readBack(event.id), {
      pet_id: petId,
      caused_by: 'pet',
      attributed_by: 'recognizer',
    });
  });

  it('records the specific non-pet cause the model named', async () => {
    const event = await insertLitterboxEvent(ctx.db, { pet_id: null });

    const outcome = await recordIdentification(
      ctx.db,
      event.id,
      verdict.robotVacuum(),
    );

    assert.equal(outcome, 'applied');
    assert.deepEqual(await readBack(event.id), {
      pet_id: null,
      caused_by: 'robot_vacuum',
      attributed_by: 'recognizer',
    });
  });

  it('will not overwrite an event already attributed to a pet', async () => {
    // The regression this guards: a stale or mistaken AI verdict wiping an
    // attribution someone already made.
    const event = await insertLitterboxEvent(ctx.db, {
      pet_id: petId,
      caused_by: 'pet',
      attributed_by: 'manual',
    });

    const outcome = await recordIdentification(
      ctx.db,
      event.id,
      verdict.robotVacuum(),
    );

    assert.equal(outcome, 'already_attributed');
    assert.deepEqual(await readBack(event.id), {
      pet_id: petId,
      caused_by: 'pet',
      attributed_by: 'manual',
    });
  });

  it('will not overwrite an event already resolved to a non-pet cause', async () => {
    const event = await insertLitterboxEvent(ctx.db, {
      pet_id: null,
      caused_by: 'human',
      attributed_by: 'manual',
    });

    const outcome = await recordIdentification(
      ctx.db,
      event.id,
      verdict.pet(petId, 'Mochi'),
    );

    assert.equal(outcome, 'already_attributed');
    assert.deepEqual(await readBack(event.id), {
      pet_id: null,
      caused_by: 'human',
      attributed_by: 'manual',
    });
  });

  it('writes nothing for an unknown verdict', async () => {
    const event = await insertLitterboxEvent(ctx.db, { pet_id: null });

    const outcome = await recordIdentification(
      ctx.db,
      event.id,
      verdict.unknown(),
    );

    assert.equal(outcome, 'unresolved');
    assert.deepEqual(await readBack(event.id), {
      pet_id: null,
      caused_by: 'unknown',
      attributed_by: null,
    });
  });
});
