import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';

import { insertPet, insertPetPresenceEvent } from '../helpers/fixtures.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('pets API detail', () => {
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

  async function createPet(name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pets',
      payload: { name, breed: 'Unknown', birth_date: '2021-01-01' },
    });
    assert.equal(res.statusCode, 200);
    return res.json<{ id: number }>();
  }

  async function presenceEventCount(petId: number): Promise<number> {
    const row = await ctx.db
      .selectFrom('event')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('pet_id', '=', petId)
      .where(sql`json_extract(data, '$.type')`, '=', 'pet_presence')
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  it('returns a single pet with its latest presence', async () => {
    const pet = await insertPet(ctx.db, {
      name: 'Detail Cat',
      breed: 'Siamese',
      birth_date: new Date('2018-03-20'),
    });
    await insertPetPresenceEvent(ctx.db, {
      pet_id: pet.id,
      state: 'away',
      context: 'vet',
      previous_state: 'home',
    });

    const res = await app.inject({ method: 'GET', url: `/api/pets/${pet.id}` });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.name, 'Detail Cat');
    assert.deepEqual(body.presence, { state: 'away', context: 'vet' });
    assert.equal(body.closed_at, null);
    assert.equal(body.sex, 'unknown');
    assert.equal(body.altered, 'unknown');
    assert.equal(body.microchip, null);
    assert.equal(body.avatar_url, undefined);
  });

  it('stores profile fields and keeps only the microchip digits', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/pets',
      payload: {
        name: 'Chip Cat',
        breed: 'Maine Coon',
        microchip: '941 000 024 518 307',
        sex: 'female',
        altered: 'altered',
      },
    });
    assert.equal(create.statusCode, 200);
    const created = create.json();
    assert.equal(created.microchip, '941000024518307');
    assert.equal(created.sex, 'female');
    assert.equal(created.altered, 'altered');

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/pets/${created.id}`,
      payload: { microchip: null, sex: 'male' },
    });
    assert.equal(cleared.statusCode, 200);
    assert.equal(cleared.json().microchip, null);
    assert.equal(cleared.json().sex, 'male');
    assert.equal(cleared.json().altered, 'altered');
  });

  it('rejects a malformed microchip and an unknown sex', async () => {
    const { id } = await createPet('Strict Cat');
    for (const payload of [
      { microchip: '12345' },
      { microchip: '94100002451830712' },
      { microchip: '941-000' },
      { sex: 'other' },
    ]) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pets/${id}`,
        payload,
      });
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
    }
  });

  it('records a presence change and writes nothing when it is unchanged', async () => {
    const { id } = await createPet('Presence Cat');

    const vet = await app.inject({
      method: 'PUT',
      url: `/api/pets/${id}/presence`,
      payload: { state: 'away', context: 'vet' },
    });
    assert.equal(vet.statusCode, 200);
    assert.equal(vet.json().event.data.state, 'away');
    assert.equal(vet.json().event.data.context, 'vet');
    assert.equal(vet.json().event.data.previous_state, 'unknown');

    const again = await app.inject({
      method: 'PUT',
      url: `/api/pets/${id}/presence`,
      payload: { state: 'away', context: 'vet' },
    });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().event, null);
    assert.equal(await presenceEventCount(id), 1);

    const home = await app.inject({
      method: 'PUT',
      url: `/api/pets/${id}/presence`,
      payload: { state: 'home' },
    });
    assert.equal(home.json().event.data.previous_state, 'away');
  });

  it('refuses a profile context on the presence endpoint', async () => {
    const { id } = await createPet('Sneaky Cat');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/pets/${id}/presence`,
      payload: { state: 'away', context: 'profile_closed' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(await presenceEventCount(id), 0);
  });

  it('closes and reopens a profile through presence events', async () => {
    const { id } = await createPet('Closing Cat');

    const closed = await app.inject({
      method: 'POST',
      url: `/api/pets/${id}/close-profile`,
    });
    assert.equal(closed.statusCode, 200);
    assert.ok(closed.json().closed_at);
    assert.deepEqual(closed.json().presence, {
      state: 'away',
      context: 'profile_closed',
    });

    const closedAgain = await app.inject({
      method: 'POST',
      url: `/api/pets/${id}/close-profile`,
    });
    assert.equal(closedAgain.json().closed_at, closed.json().closed_at);
    assert.equal(await presenceEventCount(id), 1);

    const presence = await app.inject({
      method: 'PUT',
      url: `/api/pets/${id}/presence`,
      payload: { state: 'home' },
    });
    assert.equal(presence.statusCode, 409);

    const reopened = await app.inject({
      method: 'POST',
      url: `/api/pets/${id}/reopen-profile`,
    });
    assert.equal(reopened.statusCode, 200);
    assert.equal(reopened.json().closed_at, null);
    assert.deepEqual(reopened.json().presence, {
      state: 'home',
      context: 'profile_reopened',
    });

    const reopenedAgain = await app.inject({
      method: 'POST',
      url: `/api/pets/${id}/reopen-profile`,
    });
    assert.equal(reopenedAgain.statusCode, 200);
    assert.equal(await presenceEventCount(id), 2);
  });

  it('keeps the generic event routes from rewriting a closure', async () => {
    const { id } = await createPet('Guarded Cat');
    await app.inject({ method: 'POST', url: `/api/pets/${id}/close-profile` });
    const closeEvent = await ctx.db
      .selectFrom('event')
      .select('id')
      .where('pet_id', '=', id)
      .executeTakeFirstOrThrow();

    const postProfile = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: id,
        device_id: null,
        parent_event_id: null,
        human_verified: true,
        data: {
          type: 'pet_presence',
          state: 'home',
          context: 'profile_reopened',
        },
      },
    });
    assert.equal(postProfile.statusCode, 400);
    assert.match(postProfile.json().message, /pet endpoints/);

    const postHome = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        pet_id: id,
        device_id: null,
        parent_event_id: null,
        human_verified: true,
        data: { type: 'pet_presence', state: 'home' },
      },
    });
    assert.equal(postHome.statusCode, 409);

    const editClose = await app.inject({
      method: 'PATCH',
      url: `/api/events/${closeEvent.id}`,
      payload: { data: { type: 'pet_presence', state: 'home' } },
    });
    assert.equal(editClose.statusCode, 409);

    const noteOnClose = await app.inject({
      method: 'PATCH',
      url: `/api/events/${closeEvent.id}`,
      payload: { note: 'Rehomed to the neighbours' },
    });
    assert.equal(noteOnClose.statusCode, 200);

    const deleteClose = await app.inject({
      method: 'DELETE',
      url: `/api/events/${closeEvent.id}`,
    });
    assert.equal(deleteClose.statusCode, 409);

    const pet = await app.inject({ method: 'GET', url: `/api/pets/${id}` });
    assert.ok(pet.json().closed_at);
  });

  it('hides a closed profile from the event list unless the pet is named', async () => {
    const { id: closedId } = await createPet('Hidden Cat');
    const { id: openId } = await createPet('Shown Cat');
    for (const petId of [closedId, openId, null]) {
      await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          pet_id: petId,
          device_id: null,
          parent_event_id: null,
          human_verified: true,
          data: { type: 'water_intake', amount: 12 },
        },
      });
    }
    await app.inject({
      method: 'POST',
      url: `/api/pets/${closedId}/close-profile`,
    });

    const all = await app.inject({
      method: 'GET',
      url: '/api/events?eventType=water_intake',
    });
    const petIds = all
      .json()
      .data.map((e: { pet_id: number | null }) => e.pet_id);
    assert.equal(petIds.includes(closedId), false);
    assert.equal(petIds.includes(openId), true);
    assert.equal(petIds.includes(null), true);
    assert.equal(all.json().total, petIds.length);

    const named = await app.inject({
      method: 'GET',
      url: `/api/events?pet_id=${closedId}&eventType=water_intake`,
    });
    assert.equal(named.json().data.length, 1);
  });

  it('still lets an ordinary presence event be edited on an open profile', async () => {
    const { id } = await createPet('Vet Cat');
    const vet = await app.inject({
      method: 'PUT',
      url: `/api/pets/${id}/presence`,
      payload: { state: 'away', context: 'vet' },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/events/${vet.json().event.id}`,
      payload: {
        data: { type: 'pet_presence', state: 'away', context: 'friend' },
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.context, 'friend');
  });
});
