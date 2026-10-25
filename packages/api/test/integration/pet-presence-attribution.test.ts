import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { CompiledQuery, type Compilable } from 'kysely';

import {
  insertPet,
  insertPetPresenceEvent,
  insertWeightMeasurementEvent,
} from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';
import {
  getLitterboxCandidateWeights,
  latestWeightQuery,
} from '../../src/services/devices/providers/esphome/analyzeLitterboxUse.ts';
import {
  attributionCandidatesAt,
  latestPresenceQuery,
  presenceAt,
} from '../../src/services/events/petPresence.ts';

const at = (iso: string) => new Date(iso);

describe('presence-gated attribution', () => {
  let ctx: TestDbContext;
  let luna: number;
  let jazz: number;

  before(async () => {
    ctx = await createTestDb();
  });

  after(async () => {
    await destroyTestDb(ctx);
  });

  beforeEach(async () => {
    await ctx.db.deleteFrom('event').execute();
    await ctx.db.deleteFrom('pet').execute();
    luna = (await insertPet(ctx.db, { name: 'Luna' })).id;
    jazz = (await insertPet(ctx.db, { name: 'Jazz' })).id;
    for (const [petId, weight] of [
      [luna, 3900],
      [jazz, 5200],
    ]) {
      await insertWeightMeasurementEvent(ctx.db, {
        pet_id: petId,
        weight,
        timestamp: at('2026-10-01T08:00:00Z'),
      });
    }
  });

  it('reads presence as of the given time, not the latest one', async () => {
    await insertPetPresenceEvent(ctx.db, {
      pet_id: luna,
      state: 'away',
      context: 'vet',
      timestamp: at('2026-10-10T09:00:00Z'),
    });
    await insertPetPresenceEvent(ctx.db, {
      pet_id: luna,
      state: 'home',
      timestamp: at('2026-10-12T09:00:00Z'),
    });

    const during = await presenceAt(ctx.db, [luna], at('2026-10-11T00:00:00Z'));
    assert.equal(during.get(luna)?.data.context, 'vet');
    const before = await presenceAt(ctx.db, [luna], at('2026-10-09T00:00:00Z'));
    assert.equal(before.has(luna), false);
  });

  it('leaves a cat at the vet out of the litterbox roster', async () => {
    await insertPetPresenceEvent(ctx.db, {
      pet_id: luna,
      state: 'away',
      context: 'vet',
      timestamp: at('2026-10-10T09:00:00Z'),
    });

    const roster = await getLitterboxCandidateWeights(
      ctx.db,
      at('2026-10-10T12:00:00Z'),
    );
    assert.deepEqual([...roster], [[jazz, 5200]]);
  });

  it('keeps an outdoor cat in the litterbox roster', async () => {
    await insertPetPresenceEvent(ctx.db, {
      pet_id: luna,
      state: 'outside',
      timestamp: at('2026-10-10T09:00:00Z'),
    });

    const roster = await getLitterboxCandidateWeights(
      ctx.db,
      at('2026-10-10T12:00:00Z'),
    );
    assert.equal(roster.get(luna), 3900);
  });

  it('still offers a closed pet for a visit from before the close', async () => {
    await insertPetPresenceEvent(ctx.db, {
      pet_id: luna,
      state: 'away',
      context: 'profile_closed',
      timestamp: at('2026-10-20T09:00:00Z'),
    });

    const lateRecord = await getLitterboxCandidateWeights(
      ctx.db,
      at('2026-10-19T22:00:00Z'),
    );
    assert.equal(lateRecord.get(luna), 3900);
    const afterClose = await attributionCandidatesAt(
      ctx.db,
      [luna, jazz],
      at('2026-10-21T00:00:00Z'),
    );
    assert.deepEqual([...afterClose], [jazz]);
  });

  it('seeks the partial indexes for the presence and weight lookups', async () => {
    const plan = async (query: Compilable) => {
      const { sql: text, parameters } = query.compile();
      const { rows } = await ctx.db.executeQuery<{ detail: string }>(
        CompiledQuery.raw(`EXPLAIN QUERY PLAN ${text}`, [...parameters]),
      );
      return rows.map((row) => row.detail).join('\n');
    };
    const now = new Date();

    assert.match(
      await plan(latestPresenceQuery(ctx.db, luna, now)),
      /idx_event_pet_presence/,
    );
    assert.match(
      await plan(latestWeightQuery(ctx.db, luna, now)),
      /idx_event_pet_weight/,
    );
  });
});
