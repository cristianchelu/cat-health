import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';

import {
  insertFood,
  insertFoodIntakeEvent,
  insertLitterboxEvent,
  insertPet,
} from '../helpers/fixtures.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('events API mutations', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;

  before(async () => {
    ctx = await createTestDb();
    app = await createTestApp(ctx);
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('creates a manual litterbox event and returns it', async () => {
    const pet = await insertPet(ctx.db, { name: 'Manual Cat' });

    const create = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: pet.id,
        device_id: null,
        parent_event_id: null,
        human_verified: true,
        data: {
          type: 'litterbox_use',
          elimination_type: 'urination',
          elimination_weight: 22,
          duration: 45,
        },
      },
    });

    assert.equal(create.statusCode, 200);
    const created = create.json();
    assert.equal(created.pet_id, pet.id);
    assert.equal(created.data.elimination_weight, 22);
    assert.equal(created.human_verified, true);
  });

  it('creates food_intake with a moisture child event', async () => {
    const pet = await insertPet(ctx.db, { name: 'Fed Cat' });
    const food = await insertFood(ctx.db, {
      name: 'Wet pouch',
      food_type: 'complete_wet',
      moisture_percent: 80,
    });

    const create = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: pet.id,
        device_id: null,
        parent_event_id: null,
        human_verified: true,
        data: {
          type: 'food_intake',
          food_type: 'unknown',
          amount: 50,
          food_id: food.id,
        },
      },
    });

    assert.equal(create.statusCode, 200);
    const parent = create.json();
    assert.equal(parent.data.food_id, food.id);
    assert.equal(parent.data.nutrients.moisture_ml, 40);
    assert.equal(parent.human_verified, true);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/events/${parent.id}`,
    });
    assert.equal(detail.statusCode, 200);
    const withChildren = detail.json();
    assert.equal(withChildren.children.length, 1);
    assert.equal(withChildren.children[0].data.type, 'water_intake');
    assert.equal(withChildren.children[0].data.amount, 40);
    assert.equal(withChildren.children[0].data.source, 'food');
  });

  it('recomputes nutrients and the moisture child when the grams change', async () => {
    const pet = await insertPet(ctx.db, { name: 'Overfed Cat' });
    const food = await insertFood(ctx.db, {
      name: 'Wet pouch',
      food_type: 'complete_wet',
      moisture_percent: 80,
      calories_per_100g: 90,
    });

    const create = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: pet.id,
        device_id: null,
        parent_event_id: null,
        human_verified: true,
        data: {
          type: 'food_intake',
          food_type: 'unknown',
          amount: 50,
          food_id: food.id,
        },
      },
    });
    const parent = create.json();
    assert.equal(parent.data.nutrients.calories, 45);

    // What the edit form sends: the stored data with only the amount moved.
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${parent.id}`,
      payload: {
        data: { ...parent.data, amount: 25 },
        human_verified: true,
      },
    });
    assert.equal(patch.statusCode, 200);
    // The stale nutrients in the body were recomputed from the food row.
    assert.equal(patch.json().data.nutrients.calories, 22.5);
    assert.equal(patch.json().data.nutrients.moisture_ml, 20);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/events/${parent.id}`,
    });
    const children = detail.json().children;
    assert.equal(children.length, 1);
    assert.equal(children[0].data.amount, 20);
  });

  it('scales nutrients linearly when no food row backs them', async () => {
    const pet = await insertPet(ctx.db, { name: 'Orphan Meal Cat' });
    const event = await insertFoodIntakeEvent(ctx.db, {
      pet_id: pet.id,
      food_type: 'wet',
      amount: 50,
      nutrients: { calories: 100, moisture_ml: 20 },
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: {
        data: {
          type: 'food_intake',
          food_type: 'wet',
          amount: 25,
          nutrients: { calories: 100, moisture_ml: 20 },
        },
      },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().data.nutrients.calories, 50);
    assert.equal(patch.json().data.nutrients.moisture_ml, 10);

    // The meal now owes a moisture child it never had.
    const detail = await app.inject({
      method: 'GET',
      url: `/api/events/${event.id}`,
    });
    assert.equal(detail.json().children.length, 1);
    assert.equal(detail.json().children[0].data.amount, 10);
    assert.equal(detail.json().children[0].data.source, 'food');
  });

  it('leaves nutrients and the moisture child alone on note and verify patches', async () => {
    const pet = await insertPet(ctx.db, { name: 'Annotated Cat' });
    const food = await insertFood(ctx.db, {
      name: 'Wet pouch',
      food_type: 'complete_wet',
      moisture_percent: 80,
      calories_per_100g: 90,
    });

    const create = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: pet.id,
        device_id: null,
        parent_event_id: null,
        human_verified: false,
        data: {
          type: 'food_intake',
          food_type: 'unknown',
          amount: 50,
          food_id: food.id,
        },
      },
    });
    const parent = create.json();

    // The catalog moves on; history must not move with it on a text edit.
    await ctx.db
      .updateTable('food')
      .set({ calories_per_100g: 500, moisture_percent: 10 })
      .where('id', '=', food.id)
      .execute();

    const note = await app.inject({
      method: 'PATCH',
      url: `/api/events/${parent.id}`,
      payload: { note: 'Half left in the bowl.' },
    });
    assert.equal(note.statusCode, 200);
    assert.equal(note.json().data.nutrients.calories, 45);

    const verify = await app.inject({
      method: 'PATCH',
      url: `/api/events/${parent.id}`,
      payload: { human_verified: true },
    });
    assert.equal(verify.statusCode, 200);
    assert.equal(verify.json().data.nutrients.calories, 45);
    assert.equal(verify.json().data.nutrients.moisture_ml, 40);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/events/${parent.id}`,
    });
    assert.equal(detail.json().children[0].data.amount, 40);
  });

  it('scales rather than erases when the food row has no nutrition data', async () => {
    const pet = await insertPet(ctx.db, { name: 'Name-Only Cat' });
    const bareFood = await insertFood(ctx.db, {
      name: 'Mystery kibble',
      food_type: 'complete_dry',
    });
    // The fixture defaults nutrition columns; a name-only row has none.
    await ctx.db
      .updateTable('food')
      .set({ moisture_percent: null, calories_per_100g: null })
      .where('id', '=', bareFood.id)
      .execute();
    const event = await insertFoodIntakeEvent(ctx.db, {
      pet_id: pet.id,
      food_type: 'dry',
      amount: 50,
      food_id: bareFood.id,
      nutrients: { calories: 100, moisture_ml: 20 },
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: {
        data: {
          type: 'food_intake',
          food_type: 'dry',
          amount: 25,
          food_id: bareFood.id,
          nutrients: { calories: 100, moisture_ml: 20 },
        },
      },
    });
    assert.equal(patch.statusCode, 200);
    // The name-only row cannot speak for the meal; the stored reading can.
    assert.equal(patch.json().data.nutrients.calories, 50);
    assert.equal(patch.json().data.nutrients.moisture_ml, 10);
  });

  it('drops nutrition at zero grams instead of storing zero readings', async () => {
    const pet = await insertPet(ctx.db, { name: 'Refill Cat' });
    const event = await insertFoodIntakeEvent(ctx.db, {
      pet_id: pet.id,
      food_type: 'wet',
      amount: 50,
      nutrients: { calories: 100, moisture_ml: 20 },
    });

    const toZero = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: {
        data: {
          type: 'food_intake',
          food_type: 'wet',
          amount: 0,
          nutrients: { calories: 100, moisture_ml: 20 },
        },
      },
    });
    assert.equal(toZero.statusCode, 200);
    // Zeros would masquerade as a measurement; absence is the honest state.
    assert.equal(toZero.json().data.nutrients, undefined);

    // Correcting back up finds nothing to scale from — no crash, no ghost
    // numbers, just a meal with unknown nutrition until a food is linked.
    const backUp = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: {
        data: { type: 'food_intake', food_type: 'wet', amount: 30 },
      },
    });
    assert.equal(backUp.statusCode, 200);
    assert.equal(backUp.json().data.amount, 30);
    assert.equal(backUp.json().data.nutrients, undefined);
  });

  it('rolls the whole patch back when reconciliation fails', async () => {
    const pet = await insertPet(ctx.db, { name: 'Atomic Cat' });
    const food = await insertFood(ctx.db, {
      name: 'Wet pouch',
      food_type: 'complete_wet',
      moisture_percent: 80,
    });

    const create = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: pet.id,
        device_id: null,
        parent_event_id: null,
        human_verified: true,
        data: {
          type: 'food_intake',
          food_type: 'unknown',
          amount: 50,
          food_id: food.id,
        },
      },
    });
    const parent = create.json();

    // Corrupt the food row so nutrient recomputation throws mid-reconcile.
    await sql`update food set nutrients = '{broken' where id = ${food.id}`.execute(
      ctx.db,
    );

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${parent.id}`,
      payload: { data: { ...parent.data, amount: 25 } },
    });
    assert.equal(patch.statusCode, 500);

    // The failed patch left nothing behind: old grams, old calories, and the
    // moisture child still sized for them.
    const detail = await app.inject({
      method: 'GET',
      url: `/api/events/${parent.id}`,
    });
    assert.equal(detail.json().data.amount, 50);
    assert.equal(detail.json().data.nutrients.moisture_ml, 40);
    assert.equal(detail.json().children[0].data.amount, 40);
  });

  it('takes the moisture child along when the meal is reattributed', async () => {
    const pet = await insertPet(ctx.db, { name: 'Refill Victim' });
    const food = await insertFood(ctx.db, {
      name: 'Wet pouch',
      food_type: 'complete_wet',
      moisture_percent: 80,
    });

    const create = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: pet.id,
        device_id: null,
        parent_event_id: null,
        human_verified: true,
        data: {
          type: 'food_intake',
          food_type: 'unknown',
          amount: 50,
          food_id: food.id,
        },
      },
    });
    const parent = create.json();

    // A refill misread as a meal: a person, not the cat. The child must stop
    // counting as the cat's water intake, not just the parent's food.
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${parent.id}`,
      payload: { caused_by: 'human' },
    });
    assert.equal(patch.statusCode, 200);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/events/${parent.id}`,
    });
    const child = detail.json().children[0];
    assert.equal(child.caused_by, 'human');
    assert.equal(child.pet_id, null);
  });

  it('drops nutrition and the moisture child when the food is unlinked', async () => {
    const pet = await insertPet(ctx.db, { name: 'Unlinked Cat' });
    const food = await insertFood(ctx.db, {
      name: 'Wet pouch',
      food_type: 'complete_wet',
      moisture_percent: 80,
    });

    const create = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: pet.id,
        device_id: null,
        parent_event_id: null,
        human_verified: true,
        data: {
          type: 'food_intake',
          food_type: 'unknown',
          amount: 50,
          food_id: food.id,
        },
      },
    });
    const parent = create.json();

    // The edit form's unlink patch: no food_id, no nutrients.
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${parent.id}`,
      payload: {
        data: { type: 'food_intake', food_type: 'unknown', amount: 50 },
      },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().data.food_id, undefined);
    assert.equal(patch.json().data.nutrients, undefined);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/events/${parent.id}`,
    });
    assert.equal(detail.json().children.length, 0);
  });

  it('patches human_verified and deletes an event', async () => {
    const pet = await insertPet(ctx.db, { name: 'Patch Cat' });
    const event = await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      human_verified: false,
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { human_verified: true },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().human_verified, true);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/events/${event.id}`,
    });
    assert.equal(del.statusCode, 200);
    assert.equal(del.json().success, true);

    const missing = await app.inject({
      method: 'GET',
      url: `/api/events/${event.id}`,
    });
    assert.equal(missing.statusCode, 404);
  });

  it('filters the event list by human_verified', async () => {
    const pet = await insertPet(ctx.db, { name: 'Filter Cat' });
    await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      human_verified: true,
      elimination_weight: 11,
    });
    await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      human_verified: false,
      elimination_weight: 12,
    });

    const verified = await app.inject({
      method: 'GET',
      url: `/api/events?pet_id=${pet.id}&human_verified=true`,
    });
    assert.equal(verified.statusCode, 200);
    const verifiedBody = verified.json();
    assert.equal(verifiedBody.total, 1);
    assert.equal(verifiedBody.data[0].data.elimination_weight, 11);
  });

  it('reports the cause for attributed and unresolved events', async () => {
    const pet = await insertPet(ctx.db, { name: 'Attributed Cat' });
    const identified = await insertLitterboxEvent(ctx.db, { pet_id: pet.id });
    const unresolved = await insertLitterboxEvent(ctx.db, { pet_id: null });

    for (const [id, expected] of [
      [identified.id, 'pet'],
      [unresolved.id, 'unknown'],
    ] as const) {
      const res = await app.inject({ method: 'GET', url: `/api/events/${id}` });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().caused_by, expected);
    }
  });

  it('patches an event to a non-pet cause and clears pet_id', async () => {
    const pet = await insertPet(ctx.db, { name: 'Vacuum Victim' });
    const event = await insertLitterboxEvent(ctx.db, { pet_id: pet.id });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { caused_by: 'robot_vacuum' },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().caused_by, 'robot_vacuum');
    assert.equal(patch.json().pet_id, null);
    // A person editing an event is the source of what they set.
    assert.equal(patch.json().attributed_by, 'manual');

    const read = await app.inject({
      method: 'GET',
      url: `/api/events/${event.id}`,
    });
    assert.equal(read.json().caused_by, 'robot_vacuum');
    assert.equal(read.json().pet_id, null);
  });

  it('keeps a settled cause across a patch that does not mention it', async () => {
    // The FK-repair pass also writes attribution columns; an unrelated edit
    // must not quietly undo a cause someone already settled.
    const event = await insertLitterboxEvent(ctx.db, {
      pet_id: null,
      caused_by: 'human',
      attributed_by: 'manual',
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { human_verified: true },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().caused_by, 'human');
    assert.equal(patch.json().human_verified, true);
  });

  it('moves back to pet when a pet is assigned', async () => {
    const pet = await insertPet(ctx.db, { name: 'Reassigned Cat' });
    const event = await insertLitterboxEvent(ctx.db, {
      pet_id: null,
      caused_by: 'robot_vacuum',
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { pet_id: pet.id },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().pet_id, pet.id);
    assert.equal(patch.json().caused_by, 'pet');
  });

  it('rejects a pet_id alongside a non-pet cause', async () => {
    const pet = await insertPet(ctx.db, { name: 'Contradiction Cat' });
    const event = await insertLitterboxEvent(ctx.db, { pet_id: null });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { pet_id: pet.id, caused_by: 'human' },
    });
    assert.equal(patch.statusCode, 400);
  });

  it('accepts pet with no pet_id — a pet, but we cannot say which', async () => {
    const event = await insertLitterboxEvent(ctx.db, { pet_id: null });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { pet_id: null, caused_by: 'pet' },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().caused_by, 'pet');
    assert.equal(patch.json().pet_id, null);
  });

  it('drops attribution back to unresolved when the pet is deleted', async () => {
    const pet = await insertPet(ctx.db, { name: 'Doomed Cat' });
    const event = await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      attributed_by: 'manual',
    });

    // Simulate the orphan the FK-repair pass exists to clean up: a dangling
    // reference can only be created the way real ones are, with enforcement off.
    await sql`PRAGMA foreign_keys = OFF`.execute(ctx.db);
    await ctx.db.deleteFrom('pet').where('id', '=', pet.id).execute();
    await sql`PRAGMA foreign_keys = ON`.execute(ctx.db);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { human_verified: true },
    });
    assert.equal(patch.statusCode, 200);
    // 'pet' with no pet_id would claim we still know an animal did it.
    assert.equal(patch.json().caused_by, 'unknown');
    assert.equal(patch.json().pet_id, null);
    assert.equal(patch.json().attributed_by, null);
  });

  it('filters the event list by cause', async () => {
    // Isolated in its own time window so events from other tests can't leak in.
    const windowStart = new Date('2020-03-01T00:00:00.000Z');
    const windowEnd = new Date('2020-03-02T00:00:00.000Z');
    const at = (hour: number) => new Date(`2020-03-01T0${hour}:00:00.000Z`);

    const pet = await insertPet(ctx.db, { name: 'Queue Cat' });
    const byPet = await insertLitterboxEvent(ctx.db, {
      pet_id: pet.id,
      timestamp: at(1),
    });
    const unresolved = await insertLitterboxEvent(ctx.db, {
      pet_id: null,
      timestamp: at(2),
    });
    const byVacuum = await insertLitterboxEvent(ctx.db, {
      pet_id: null,
      caused_by: 'robot_vacuum',
      timestamp: at(3),
    });
    const byHuman = await insertLitterboxEvent(ctx.db, {
      pet_id: null,
      caused_by: 'human',
      timestamp: at(4),
    });

    const ids = async (cause: string): Promise<number[]> => {
      const res = await app.inject({
        method: 'GET',
        url:
          `/api/events?caused_by=${cause}` +
          `&startTime=${windowStart.toISOString()}&endTime=${windowEnd.toISOString()}`,
      });
      assert.equal(res.statusCode, 200);
      return res
        .json()
        .data.map((e: { id: number }) => e.id)
        .sort();
    };

    // The review queue is `unknown` alone — every settled cause is out of it,
    // and the two non-pet causes stay distinguishable from each other.
    assert.deepEqual(await ids('unknown'), [unresolved.id]);
    assert.deepEqual(await ids('pet'), [byPet.id]);
    assert.deepEqual(await ids('robot_vacuum'), [byVacuum.id]);
    assert.deepEqual(await ids('human'), [byHuman.id]);
  });

  it('writes, overwrites and clears the event note', async () => {
    const pet = await insertPet(ctx.db, { name: 'Noted Cat' });
    const event = await insertLitterboxEvent(ctx.db, { pet_id: pet.id });

    const fresh = await app.inject({
      method: 'GET',
      url: `/api/events/${event.id}`,
    });
    assert.equal(fresh.json().note, null);
    assert.equal(fresh.json().note_updated_at, null);

    const write = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { note: 'Litter changed this morning.' },
    });
    assert.equal(write.statusCode, 200);
    assert.equal(write.json().note, 'Litter changed this morning.');
    // The line under the note is only honest if the timestamp lands with it.
    assert.ok(write.json().note_updated_at);

    const overwrite = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { note: 'Heavier scoop than usual.' },
    });
    assert.equal(overwrite.json().note, 'Heavier scoop than usual.');

    // Emptied text is the same intent as a clear, and takes the timestamp
    // with it rather than leaving an authored-at line over nothing.
    const clear = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { note: '' },
    });
    assert.equal(clear.json().note, null);
    assert.equal(clear.json().note_updated_at, null);
  });

  it('leaves the note alone on a patch that does not mention it', async () => {
    const pet = await insertPet(ctx.db, { name: 'Kept Note Cat' });
    const event = await insertLitterboxEvent(ctx.db, { pet_id: pet.id });

    await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { note: 'Watch this one.' },
    });
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      payload: { human_verified: true },
    });

    assert.equal(patched.json().human_verified, true);
    assert.equal(patched.json().note, 'Watch this one.');
  });

  it('returns an empty media list for events without attachments', async () => {
    const pet = await insertPet(ctx.db, { name: 'Media Cat' });
    const event = await insertLitterboxEvent(ctx.db, { pet_id: pet.id });

    const res = await app.inject({
      method: 'GET',
      url: `/api/events/${event.id}/media`,
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), []);
  });
});
