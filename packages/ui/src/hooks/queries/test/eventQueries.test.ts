import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import type { GetEventDTO, GetEventWithChildrenDTO } from 'shared';

import {
  applyServerEventToEventCaches,
  invalidateQueriesAfterEventPatch,
} from '../eventQueries.ts';

/*
 * The one funnel every patch path goes through. What is under test is cache
 * policy, not rendering: which queries a write marks stale, and that the
 * childless PATCH body never un-loads children a surface is mid-render on.
 */

const clients: QueryClient[] = [];

function makeClient(): QueryClient {
  const client = new QueryClient();
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

const PATCHED_MEAL: GetEventDTO = {
  id: 7,
  parent_event_id: null,
  pet_id: 2,
  caused_by: 'pet',
  attributed_by: 'microchip',
  device_id: 5,
  timestamp: '2026-08-20T05:12:00.000Z',
  data: { type: 'food_intake', food_type: 'dry', amount: 42 },
  human_verified: true,
  note: null,
  note_updated_at: null,
  raw_data: null,
};

function seedTrends(client: QueryClient) {
  client.setQueryData(['foodTrends', 2], []);
  client.setQueryData(['waterTrends', 2], []);
  client.setQueryData(['petEvents', 2], []);
}

function isStale(client: QueryClient, key: unknown[]): boolean {
  return client.getQueryState(key)?.isInvalidated ?? false;
}

describe('invalidateQueriesAfterEventPatch', () => {
  it('marks the trend cards stale for intake events', () => {
    const client = makeClient();
    seedTrends(client);

    invalidateQueriesAfterEventPatch(client, PATCHED_MEAL);

    assert.equal(isStale(client, ['foodTrends', 2]), true);
    assert.equal(isStale(client, ['waterTrends', 2]), true);
    assert.equal(isStale(client, ['petEvents', 2]), true);
  });

  it('spares the trend cards for events that cannot move them', () => {
    const client = makeClient();
    seedTrends(client);

    invalidateQueriesAfterEventPatch(client, {
      data: { type: 'litterbox_use' },
    });

    // The lists still refresh; the two trend scans do not.
    assert.equal(isStale(client, ['petEvents', 2]), true);
    assert.equal(isStale(client, ['foodTrends', 2]), false);
    assert.equal(isStale(client, ['waterTrends', 2]), false);
  });

  it('assumes the worst when handed no event — the delete path', () => {
    const client = makeClient();
    seedTrends(client);

    invalidateQueriesAfterEventPatch(client);

    assert.equal(isStale(client, ['foodTrends', 2]), true);
    assert.equal(isStale(client, ['waterTrends', 2]), true);
  });
});

describe('applyServerEventToEventCaches', () => {
  it('keeps cached children under the childless PATCH body', () => {
    const client = makeClient();
    const detail: GetEventWithChildrenDTO = {
      ...PATCHED_MEAL,
      children: [
        {
          id: 8,
          parent_event_id: 7,
          pet_id: 2,
          caused_by: 'pet',
          attributed_by: 'microchip',
          device_id: null,
          timestamp: PATCHED_MEAL.timestamp,
          data: { type: 'water_intake', amount: 4.2, source: 'food' },
          human_verified: true,
          note: null,
          note_updated_at: null,
          raw_data: null,
        },
      ],
    };
    client.setQueryData(['event', 7], detail);

    applyServerEventToEventCaches(client, {
      ...PATCHED_MEAL,
      data: { type: 'food_intake', food_type: 'dry', amount: 21 },
    });

    const cached = client.getQueryData<GetEventWithChildrenDTO>(['event', 7]);
    // The row updates instantly; the children stay rather than vanishing
    // from an open surface...
    assert.equal(cached?.data.type === 'food_intake' && cached.data.amount, 21);
    assert.equal(cached?.children.length, 1);
    // ...and the detail is marked stale so they catch up with whatever the
    // server reconciled.
    assert.equal(isStale(client, ['event', 7]), true);
  });

  it('stores the bare event when nothing richer was cached', () => {
    const client = makeClient();

    applyServerEventToEventCaches(client, PATCHED_MEAL);

    const cached = client.getQueryData<GetEventDTO>(['event', 7]);
    assert.equal(cached?.id, 7);
    assert.equal('children' in (cached ?? {}), false);
  });
});
