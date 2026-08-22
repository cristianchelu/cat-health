import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createDefaultSettingsResponse,
  DEVICE_SIGNAL_KEYS,
  type DeviceListItemDTO,
  type DeviceSignal,
} from 'shared';

import DeviceCard from '../DeviceCard.tsx';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { renderWithProviders } from '@/test/render.tsx';

/* The card's four tiers — identity, gauge, meta lines, drawer — say what a
   device currently needs. Phase 8 swaps the meta line, the status dot and the
   identity block for kit components; what a reader can see and name has to
   survive that, so it is what these hold. */

const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
});

function signal(
  key: string,
  overrides: Partial<DeviceSignal> = {},
): DeviceSignal {
  return {
    key,
    label_key: `devices.signals.${key}`,
    value: { kind: 'none' },
    display: { kind: 'none' },
    icon: 'check',
    category: 'primary',
    ...overrides,
  };
}

const percent = (
  key: string,
  value: number,
  overrides: Partial<DeviceSignal> = {},
) =>
  signal(key, {
    value: { kind: 'percent', value },
    display: { kind: 'bar', fill: value / 100 },
    severity: { kind: 'percent', value },
    ...overrides,
  });

function device(overrides: Partial<DeviceListItemDTO> = {}): DeviceListItemDTO {
  return {
    id: 5,
    provider_account_id: 1,
    provider: 'surepet',
    external_id: 'fountain-5',
    name: 'Kitchen fountain',
    type: 'water_fountain',
    config: null,
    enabled: true,
    account_enabled: true,
    last_seen: '2026-08-20T10:00:00.000Z',
    status: 'online',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/*
 * Every reading the card prints goes through `SignalValue`, which formats
 * regionally — so the card cannot render at all without the preferences
 * provider. It also brings the real translation bundle, which is what makes
 * the assertions below readable and catches a `label_key` that stops
 * resolving.
 */
function renderCard(overrides: Partial<DeviceListItemDTO> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClients.push(client);
  client.setQueryData(['settings'], createDefaultSettingsResponse());

  return renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        {/* The drawer cells are tooltip triggers, and the app mounts the
            provider once at its root. */}
        <TooltipProvider>
          <DeviceCard device={device(overrides)} />
        </TooltipProvider>
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
    { router: { initialEntries: ['/devices'] } },
  );
}

/** The card names itself, so this is also how a reader picks it out of a grid. */
function card() {
  return screen.getByRole('link', { name: 'Kitchen fountain' });
}

describe('DeviceCard', () => {
  it('is one link to the device, named for it', async () => {
    await renderCard();

    assert.equal(card().getAttribute('href'), '/devices/5');
    /* Model, under the name — a fountain with no project name falls back to
       the brand, which is the only thing we can say about it. */
    assert.match(card().textContent ?? '', /Sure Petcare/);
  });

  it('states whether the device is reachable', async () => {
    await renderCard();
    assert.ok(within(card()).getByTitle('Online'));

    cleanup();
    await renderCard({ status: 'offline' });
    assert.ok(within(card()).getByTitle('Offline'));

    cleanup();
    await renderCard({ status: null });
    assert.ok(within(card()).getByTitle('Unknown'));
  });

  it('gives the gauge to the worst signal and names its reading', async () => {
    await renderCard({
      signals: [
        percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 12),
        percent(DEVICE_SIGNAL_KEYS.FILTER_LIFE, 80),
      ],
    });

    const text = card().textContent ?? '';
    assert.match(text, /Water\s*12%/);
    /* The loser is not dropped — it keeps a meta line with its own reading. */
    assert.match(text, /Filter life\s*80%/);
    assert.ok(within(card()).getByRole('meter', { name: 'Water' }));
  });

  it('says a reachable device has told us nothing yet, rather than showing an empty card', async () => {
    await renderCard({ signals: [] });

    assert.match(card().textContent ?? '', /No readings/);
    assert.ok(within(card()).getByRole('meter', { name: 'No readings' }));
  });

  it('flags a device that needs attention, in words', async () => {
    await renderCard({
      signals: [percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 5)],
    });

    assert.ok(within(card()).getByLabelText('Needs attention now'));
  });

  it('draws battery and signal strength as coarse glyphs that still name their reading', async () => {
    await renderCard({
      signals: [
        percent(DEVICE_SIGNAL_KEYS.BATTERY, 40, { category: 'drawer_ranked' }),
        signal(DEVICE_SIGNAL_KEYS.SIGNAL_STRENGTH, {
          category: 'drawer',
          icon: 'signal',
          display: { kind: 'segments', lit: 3, of: 4 },
          value: { kind: 'number', value: -58, unit: 'dBm' },
        }),
      ],
    });

    /* Both the wide and the narrow drawer are in the DOM — CSS picks one, so
       the reading is named twice and that is expected. */
    assert.ok(within(card()).getAllByLabelText('Battery 40%').length > 0);
    assert.ok(within(card()).getAllByLabelText(/^Signal: /).length > 0);
  });
});
