import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceType, GetDeviceResponseDTO } from 'shared';

import {
  DEVICE_SORT_KEYS,
  filterDevices,
  sortDevices,
  type DeviceLabels,
  type DeviceListEntry,
} from '../deviceListUtils.ts';

/**
 * The helpers read only the fields a config row shows, so fixtures are a
 * structurally checked slice of the DTO rather than a cast into existence.
 */
function device(
  id: number,
  name: string,
  type: DeviceType,
  provider: string,
): Pick<GetDeviceResponseDTO, 'id' | 'name' | 'type' | 'provider'> {
  return { id, name, type, provider };
}

const TYPE_LABELS: Record<DeviceType, string> = {
  litterbox: 'Litterbox',
  water_fountain: 'Water Fountain',
  feeder: 'Feeder',
  camera: 'Camera',
};

/** Mirrors the brand registry: the slug and the label are not the same string. */
const PROVIDER_LABELS: Record<string, string> = {
  petkit: 'PetKit',
  surepet: 'Sure Petcare',
  esphome: 'ESPHome',
};

const labels: DeviceLabels = {
  typeLabel: (type) => TYPE_LABELS[type],
  providerLabel: (provider) => PROVIDER_LABELS[provider] ?? provider,
};

const collator = new Intl.Collator('en');

const DEVICES = [
  device(1, 'Eversweet 3 Pro', 'water_fountain', 'petkit'),
  device(2, 'PURA MAX 2', 'litterbox', 'petkit'),
  device(3, 'Fresh Element Infinity', 'feeder', 'petkit'),
  device(4, 'Living Room Cam', 'camera', 'esphome'),
  device(5, 'Felaqua Connect', 'water_fountain', 'surepet'),
];

function names(devices: ReadonlyArray<DeviceListEntry>): string[] {
  return devices.map((entry) => entry.name);
}

describe('filterDevices', () => {
  it('returns every device, in order, for a blank query', () => {
    assert.deepEqual(names(filterDevices(DEVICES, '', labels)), names(DEVICES));
  });

  it('matches on the device name', () => {
    assert.deepEqual(names(filterDevices(DEVICES, 'pura', labels)), [
      'PURA MAX 2',
    ]);
  });

  it('matches on the translated type label, not the raw enum', () => {
    // "Eversweet 3 Pro" says nothing about being a fountain; the label is the
    // only place that word appears, and it is what the row actually renders.
    assert.deepEqual(names(filterDevices(DEVICES, 'fountain', labels)), [
      'Eversweet 3 Pro',
      'Felaqua Connect',
    ]);
    assert.deepEqual(
      names(filterDevices(DEVICES, 'water_fountain', labels)),
      [],
    );
  });

  it('matches on the provider label, spaced or not', () => {
    assert.deepEqual(names(filterDevices(DEVICES, 'sure petcare', labels)), [
      'Felaqua Connect',
    ]);
    // The brand is written "SurePet" as often as "Sure Petcare".
    assert.deepEqual(names(filterDevices(DEVICES, 'surepet', labels)), [
      'Felaqua Connect',
    ]);
  });

  it('lets separate terms land in name and provider', () => {
    assert.deepEqual(names(filterDevices(DEVICES, 'pura petkit', labels)), [
      'PURA MAX 2',
    ]);
  });

  it('leaves the input array untouched', () => {
    const input = [...DEVICES];
    filterDevices(input, 'cam', labels);
    assert.deepEqual(names(input), names(DEVICES));
  });
});

describe('sortDevices', () => {
  it('offers exactly the sort keys the toolbar can render', () => {
    assert.deepEqual([...DEVICE_SORT_KEYS], ['type', 'name', 'provider']);
  });

  it('sorts by name using the caller-supplied collator', () => {
    assert.deepEqual(
      names(
        sortDevices(
          DEVICES,
          { key: 'name', direction: 'asc' },
          { labels, collator },
        ),
      ),
      [
        'Eversweet 3 Pro',
        'Felaqua Connect',
        'Fresh Element Infinity',
        'Living Room Cam',
        'PURA MAX 2',
      ],
    );
  });

  it('groups by translated type label, then orders by name inside a group', () => {
    assert.deepEqual(
      names(
        sortDevices(
          DEVICES,
          { key: 'type', direction: 'asc' },
          { labels, collator },
        ),
      ),
      [
        'Living Room Cam',
        'Fresh Element Infinity',
        'PURA MAX 2',
        'Eversweet 3 Pro',
        'Felaqua Connect',
      ],
    );
  });

  it('groups by provider label, then orders by name inside a provider', () => {
    assert.deepEqual(
      names(
        sortDevices(
          DEVICES,
          { key: 'provider', direction: 'asc' },
          { labels, collator },
        ),
      ),
      [
        // ESPHome, then PetKit, then Sure Petcare.
        'Living Room Cam',
        'Eversweet 3 Pro',
        'Fresh Element Infinity',
        'PURA MAX 2',
        'Felaqua Connect',
      ],
    );
  });

  it('reverses the visible ordering when the direction is descending', () => {
    assert.deepEqual(
      names(
        sortDevices(
          DEVICES,
          { key: 'name', direction: 'desc' },
          { labels, collator },
        ),
      ),
      [
        'PURA MAX 2',
        'Living Room Cam',
        'Fresh Element Infinity',
        'Felaqua Connect',
        'Eversweet 3 Pro',
      ],
    );
  });

  it('reverses the grouping and the names within it', () => {
    assert.deepEqual(
      names(
        sortDevices(
          DEVICES,
          { key: 'provider', direction: 'desc' },
          { labels, collator },
        ),
      ),
      [
        'Felaqua Connect',
        'PURA MAX 2',
        'Fresh Element Infinity',
        'Eversweet 3 Pro',
        'Living Room Cam',
      ],
    );
  });

  it('breaks exact ties by id in both directions so the order never flickers', () => {
    const duplicates = [
      device(9, 'Cam', 'camera', 'esphome'),
      device(2, 'Cam', 'camera', 'esphome'),
      device(5, 'Cam', 'camera', 'esphome'),
    ];

    // The id is not on screen, so reversing it would look like nothing happened
    // while the rows jump around. Descending reverses only what you can read.
    for (const direction of ['asc', 'desc'] as const) {
      assert.deepEqual(
        sortDevices(
          duplicates,
          { key: 'name', direction },
          { labels, collator },
        ).map((entry) => entry.id),
        [2, 5, 9],
      );
    }
  });

  it('leaves the input array untouched', () => {
    const input = [...DEVICES];
    sortDevices(input, { key: 'name', direction: 'asc' }, { labels, collator });
    assert.deepEqual(names(input), names(DEVICES));
  });
});
