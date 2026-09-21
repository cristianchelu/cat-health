import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createDefaultSettingsResponse,
  type GetEventListItemDTO,
} from 'shared';

import EventTimelineItem from '../EventTimelineItem.tsx';
import {
  isPetOverviewActivityEvent,
  isDeviceTimelineEvent,
} from '../eventTimelineRegistry.ts';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

/* The device's own switch, on its timeline: says which way it went, and
   whether the whole account went with it. Held by visible text only. */

function switchEvent(
  data: Extract<GetEventListItemDTO['data'], { type: 'device_enablement' }>,
): GetEventListItemDTO {
  return {
    id: 1,
    parent_event_id: null,
    pet_id: null,
    caused_by: 'unknown',
    attributed_by: null,
    device_id: 2,
    timestamp: '2026-09-01T10:00:00.000Z',
    data,
    human_verified: true,
    note: null,
    note_updated_at: null,
  };
}

const queryClients: QueryClient[] = [];

async function renderRow(event: GetEventListItemDTO) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
  queryClients.push(client);
  client.setQueryData(['settings'], createDefaultSettingsResponse());
  return renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <ul>
          <EventTimelineItem event={event} showDevice={false} />
        </ul>
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
  );
}

describe('DeviceCentricEvent: device switch', () => {
  afterEach(() => {
    cleanup();
    for (const client of queryClients.splice(0)) {
      client.clear();
    }
  });

  it('says the device was switched off', async () => {
    await renderRow(switchEvent({ type: 'device_enablement', enabled: false }));
    assert.ok(screen.getByText('Device disabled'));
    assert.equal(screen.queryByText('with its account'), null);
  });

  it('says when it went with its account', async () => {
    await renderRow(
      switchEvent({
        type: 'device_enablement',
        enabled: true,
        cause: 'account',
      }),
    );
    assert.ok(screen.getByText('Device enabled'));
    assert.ok(screen.getByText('with its account'));
  });

  it('belongs to the device timeline, not the pet overview', () => {
    const event = switchEvent({ type: 'device_enablement', enabled: false });
    assert.equal(isDeviceTimelineEvent(event), true);
    assert.equal(isPetOverviewActivityEvent(event), false);
  });
});
