import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { computeUntrackedBuckets } from '../../src/services/analytics/trendCoverage.ts';
import { insertPet, insertPetPresenceEvent } from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

/* The pet's own absences, read the same way as a device's outages: an
   "away" already in force when the window opens seeds it from day one. */

describe('coverage while the pet is away', () => {
  let ctx: TestDbContext;
  let petId: number;

  const day = (n: number, hour = 12) =>
    new Date(Date.UTC(2026, 5, n, hour, 0, 0));

  before(async () => {
    ctx = await createTestDb();
    const pet = await insertPet(ctx.db, { name: 'Travelling Cat' });
    petId = pet.id;

    await insertPetPresenceEvent(ctx.db, {
      pet_id: petId,
      state: 'away',
      context: 'travel',
      timestamp: day(2, 8),
    });
    await insertPetPresenceEvent(ctx.db, {
      pet_id: petId,
      state: 'home',
      timestamp: day(5, 18),
    });
  });

  after(async () => {
    await destroyTestDb(ctx);
  });

  async function untrackedDays(from: number, to: number): Promise<string[]> {
    const buckets = await computeUntrackedBuckets(ctx.db, {
      petId,
      deviceClass: 'water_fountain',
      range: { start: day(from, 0), end: day(to, 0) },
      resolution: 'day',
      timezone: 'UTC',
    });
    return [...buckets].sort();
  }

  it('hatches the trip, both ends inclusive', async () => {
    assert.deepEqual(await untrackedDays(1, 8), [
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
    ]);
  });

  it('seeds a trip already under way when the window opens', async () => {
    assert.deepEqual(await untrackedDays(4, 8), ['2026-06-04', '2026-06-05']);
  });

  it('sees nothing once the pet is back', async () => {
    assert.deepEqual(await untrackedDays(6, 8), []);
  });
});
