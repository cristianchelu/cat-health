import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GetEventListItemDTO } from 'shared';

import { deriveRecentFoods, deriveUsualAmounts } from '../recentFoods.ts';

let nextId = 1;

function foodEvent(
  foodId: number | null,
  amount: number,
  timestamp: string,
): GetEventListItemDTO {
  return {
    id: nextId++,
    parent_event_id: null,
    pet_id: 1,
    caused_by: 'pet',
    attributed_by: 'manual',
    device_id: null,
    timestamp,
    human_verified: true,
    data: {
      type: 'food_intake',
      food_type: 'wet',
      amount,
      ...(foodId != null ? { food_id: foodId } : {}),
    },
  };
}

function otherEvent(timestamp: string): GetEventListItemDTO {
  return {
    id: nextId++,
    parent_event_id: null,
    pet_id: 1,
    caused_by: 'pet',
    attributed_by: null,
    device_id: null,
    timestamp,
    human_verified: false,
    data: { type: 'water_intake', amount: 12 },
  };
}

/* Newest first, the way the API returns them. */
const EVENTS: GetEventListItemDTO[] = [
  foodEvent(7, 40, '2026-08-20T09:00:00.000Z'),
  otherEvent('2026-08-20T08:30:00.000Z'),
  foodEvent(7, 85, '2026-08-19T19:00:00.000Z'),
  foodEvent(3, 85, '2026-08-19T08:00:00.000Z'),
  foodEvent(null, 20, '2026-08-18T20:00:00.000Z'),
  foodEvent(9, 20, '2026-08-18T08:00:00.000Z'),
  foodEvent(4, 5, '2026-08-17T08:00:00.000Z'),
];

describe('deriveRecentFoods', () => {
  it('takes the newest distinct foods with the time and amount of that log', () => {
    const recent = deriveRecentFoods(EVENTS);

    assert.equal(recent.length, 3);
    assert.deepEqual(recent[0], {
      foodId: 7,
      lastTimestamp: '2026-08-20T09:00:00.000Z',
      lastAmount: 40,
    });
    assert.equal(recent[1].foodId, 3);
    assert.equal(recent[2].foodId, 9);
  });

  it('ignores other event types and logs with no food linked', () => {
    const recent = deriveRecentFoods([
      otherEvent('2026-08-20T10:00:00.000Z'),
      foodEvent(null, 30, '2026-08-20T09:00:00.000Z'),
      foodEvent(7, 40, '2026-08-20T08:00:00.000Z'),
    ]);

    assert.deepEqual(
      recent.map((row) => row.foodId),
      [7],
    );
  });

  it('returns nothing when the pet has never been logged a food', () => {
    assert.deepEqual(deriveRecentFoods([]), []);
  });
});

describe('deriveUsualAmounts', () => {
  it('remembers the last amount per food, not the most frequent one', () => {
    const usual = deriveUsualAmounts(EVENTS);

    // Food 7 was logged at 85 g twice-over historically but 40 g today.
    assert.equal(usual.get(7), 40);
    assert.equal(usual.get(3), 85);
    assert.equal(usual.get(4), 5);
    assert.equal(usual.get(99), undefined);
  });

  it('covers foods past the recent cut-off, for the Browse path', () => {
    const usual = deriveUsualAmounts(EVENTS);
    assert.equal(usual.size, 4);
  });
});
