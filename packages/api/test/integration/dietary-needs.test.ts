import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type {
  GetDietaryNeedsResponse,
  GetEventsResponseDTO,
  PutDietaryNeedsRequest,
} from 'shared';

import {
  insertPet,
  insertWeightMeasurementEvent,
} from '../helpers/fixtures.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('pet dietary needs', () => {
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

  let petCount = 0;

  /** An adult cat nobody has weighed. Each test owns its pet, so order cannot couple them. */
  async function unweighedPet(): Promise<number> {
    petCount += 1;
    const pet = await insertPet(ctx.db, {
      name: `Needs Cat ${petCount}`,
      birth_date: new Date('2020-01-01'),
    });
    return pet.id;
  }

  /** An adult cat weighed once, just now, at `grams`. */
  async function weighedPet(grams: number): Promise<number> {
    const petId = await unweighedPet();
    await insertWeightMeasurementEvent(ctx.db, {
      pet_id: petId,
      weight: grams,
    });
    return petId;
  }

  async function getNeeds(petId: number): Promise<GetDietaryNeedsResponse> {
    const res = await app.inject({
      method: 'GET',
      url: `/api/pets/${petId}/dietary-needs`,
    });
    assert.equal(res.statusCode, 200);
    return res.json<GetDietaryNeedsResponse>();
  }

  async function putNeeds(
    petId: number,
    payload: PutDietaryNeedsRequest,
  ): Promise<GetDietaryNeedsResponse> {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/pets/${petId}/dietary-needs`,
      payload,
    });
    assert.equal(res.statusCode, 200);
    return res.json<GetDietaryNeedsResponse>();
  }

  async function targetEventCount(petId: number): Promise<number> {
    const row = await ctx.db
      .selectFrom('event')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('pet_id', '=', petId)
      .where('type', 'in', ['intake_target', 'weight_target'])
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  describe('GET', () => {
    it('answers 404 for a pet that does not exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pets/999999/dietary-needs',
      });
      assert.equal(res.statusCode, 404);
    });

    it('starts a pet on Maintain under the default plan', async () => {
      const { food } = await getNeeds(await weighedPet(4210));
      assert.deepEqual(
        [food.tracked, food.setting, food.plan],
        [true, { preset: 'maintain' }, ['fediaf-2025', 'aaha-2021']],
      );
    });

    it('starts a pet on Normal water under the default plan', async () => {
      const { water } = await getNeeds(await weighedPet(4210));
      assert.deepEqual(
        [water.tracked, water.setting, water.plan],
        [true, { preset: 'normal' }, ['kosmal-2025']],
      );
    });

    it('resolves the food band at her weight, bounds spelled out', async () => {
      const { food } = await getNeeds(await weighedPet(4210));
      assert.deepEqual(
        [food.band?.lower, food.band?.upper, food.band?.unit],
        [136, 196, 'kcal'],
      );
    });

    it('resolves the water band at her weight', async () => {
      const { water } = await getNeeds(await weighedPet(4210));
      assert.deepEqual(
        [water.band?.lower, water.band?.upper, water.band?.unit],
        [97, 215, 'ml'],
      );
    });

    it('names the model row a preset band came from', async () => {
      const { food } = await getNeeds(await weighedPet(4210));
      assert.deepEqual(food.band?.origin, {
        kind: 'preset',
        preset: 'maintain',
        model_id: 'fediaf-2025',
        ref: 'Table VII-9, neutered and/or indoor',
      });
    });

    it('lists every food notch with its band or the reason it has none', async () => {
      const { food } = await getNeeds(await weighedPet(4210));
      assert.deepEqual(
        food.presets.map((notch) => [
          notch.preset,
          notch.band?.lower,
          notch.gap,
        ]),
        [
          ['maintain', 136, null],
          ['lose', undefined, 'needs_target_weight'],
        ],
      );
    });

    it('gives her resting need and the floor beside the food band', async () => {
      const { food } = await getNeeds(await weighedPet(4210));
      assert.deepEqual([food.resting_kcal, food.floor_kcal], [206, 124]);
    });

    it('resolves nothing for a pet that has never been weighed', async () => {
      const needs = await getNeeds(await unweighedPet());
      assert.deepEqual(
        [
          needs.weight_kg,
          needs.food.band,
          needs.food.presets,
          needs.water.band,
        ],
        [null, null, [], null],
      );
    });

    it('works the band out at the median of her recent weigh-ins', async () => {
      const petId = await weighedPet(4200);
      await insertWeightMeasurementEvent(ctx.db, {
        pet_id: petId,
        weight: 9000,
      });
      await insertWeightMeasurementEvent(ctx.db, {
        pet_id: petId,
        weight: 4210,
      });
      assert.equal((await getNeeds(petId)).weight_kg, 4.21);
    });

    it('uses her last weigh-in when none is recent', async () => {
      const petId = await unweighedPet();
      await insertWeightMeasurementEvent(ctx.db, {
        pet_id: petId,
        weight: 4100,
        timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      });
      assert.equal((await getNeeds(petId)).weight_kg, 4.1);
    });
  });

  describe('PUT', () => {
    it('answers 404 for a pet that does not exist', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/pets/999999/dietary-needs',
        payload: { target_weight_kg: 4.8 },
      });
      assert.equal(res.statusCode, 404);
    });

    it('moves the food band to Lose at the target weight', async () => {
      const needs = await putNeeds(await weighedPet(5020), {
        food: { tracked: true, setting: { preset: 'lose' } },
        target_weight_kg: 4.8,
      });
      assert.deepEqual(
        [
          needs.target_weight_kg,
          needs.food.band?.lower,
          needs.food.band?.upper,
        ],
        [4.8, 173, 191],
      );
    });

    it('keeps a custom band as it was set', async () => {
      const needs = await putNeeds(await weighedPet(4210), {
        food: { tracked: true, setting: { target: 182, tolerance: 2 } },
      });
      assert.deepEqual(
        [
          needs.food.band?.lower,
          needs.food.band?.upper,
          needs.food.band?.origin,
        ],
        [180, 184, { kind: 'custom', source_event_id: null }],
      );
    });

    it('scales a custom water band, set per kg, by her weight', async () => {
      const needs = await putNeeds(await weighedPet(4000), {
        water: { tracked: true, setting: { target: 40, tolerance: 5 } },
      });
      assert.deepEqual(
        [needs.water.band?.lower, needs.water.band?.upper],
        [140, 180],
      );
    });

    it('stops tracking a band without losing where it was set', async () => {
      const needs = await putNeeds(await weighedPet(4210), {
        water: { tracked: false, setting: { preset: 'uti_prone' } },
      });
      assert.deepEqual(
        [needs.water.tracked, needs.water.setting],
        [false, { preset: 'uti_prone' }],
      );
    });

    it('clears the target weight with null', async () => {
      const petId = await weighedPet(5020);
      await putNeeds(petId, { target_weight_kg: 4.8 });
      const needs = await putNeeds(petId, { target_weight_kg: null });
      assert.equal(needs.target_weight_kg, null);
    });

    it('leaves the parts it was not given as they were', async () => {
      const petId = await weighedPet(5020);
      await putNeeds(petId, {
        food: { tracked: true, setting: { target: 200, tolerance: 10 } },
      });
      const needs = await putNeeds(petId, { target_weight_kg: 4.8 });
      assert.deepEqual(needs.food.setting, { target: 200, tolerance: 10 });
    });

    it('appends one event for each part that changed', async () => {
      const petId = await weighedPet(5020);
      await putNeeds(petId, {
        food: { tracked: true, setting: { preset: 'lose' } },
        water: { tracked: true, setting: { preset: 'normal' } },
        target_weight_kg: 4.8,
      });
      // Water was already on Normal, so only food and the target weight changed.
      assert.equal(await targetEventCount(petId), 2);
    });

    it('appends nothing when nothing changed', async () => {
      const petId = await weighedPet(5020);
      const change: PutDietaryNeedsRequest = {
        food: { tracked: true, setting: { preset: 'lose' } },
        target_weight_kg: 4.8,
      };
      await putNeeds(petId, change);
      await putNeeds(petId, change);
      assert.equal(await targetEventCount(petId), 2);
    });

    it('records when a target was written and that it is about the pet', async () => {
      const petId = await weighedPet(5020);
      await putNeeds(petId, { target_weight_kg: 4.8 });
      const event = await ctx.db
        .selectFrom('event')
        .select(['caused_by', 'recorded_at', 'timestamp'])
        .where('pet_id', '=', petId)
        .where('type', '=', 'weight_target')
        .executeTakeFirstOrThrow();
      assert.equal(event.caused_by, 'pet');
      assert.deepEqual(event.recorded_at, event.timestamp);
    });

    it('keeps the plan a band already had', async () => {
      const petId = await weighedPet(5020);
      await putNeeds(petId, {
        food: { tracked: true, setting: { preset: 'lose' } },
      });
      const event = await ctx.db
        .selectFrom('event')
        .select('data')
        .where('pet_id', '=', petId)
        .where('type', '=', 'intake_target')
        .executeTakeFirstOrThrow();
      assert.deepEqual(
        event.data.type === 'intake_target' ? event.data.plan : null,
        ['fediaf-2025', 'aaha-2021'],
      );
    });
  });

  describe('in the event list', () => {
    async function listEvents(query: string): Promise<GetEventsResponseDTO> {
      const res = await app.inject({
        method: 'GET',
        url: `/api/events?${query}`,
      });
      assert.equal(res.statusCode, 200);
      return res.json<GetEventsResponseDTO>();
    }

    it('leaves target events out of a plain list of what happened', async () => {
      const petId = await weighedPet(5020);
      await putNeeds(petId, { target_weight_kg: 4.8 });
      const list = await listEvents(`pet_id=${petId}`);
      assert.deepEqual(
        [list.total, list.data.map((event) => event.data.type)],
        [1, ['weight_measurement']],
      );
    });

    it('returns target events when they are asked for by type', async () => {
      const petId = await weighedPet(5020);
      await putNeeds(petId, { target_weight_kg: 4.8 });
      const list = await listEvents(`pet_id=${petId}&eventType=weight_target`);
      assert.deepEqual(
        list.data.map((event) => event.data),
        [{ type: 'weight_target', target_g: 4800 }],
      );
    });
  });
});
