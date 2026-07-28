import type { DeviceType, GetDeviceResponseDTO } from 'shared';
import { matchesSearchQuery } from '@/lib/listSearch';
import { sortDirectionSign, type SortDirection } from '@/lib/listSort';

/**
 * The slice of a device a config row shows. Taking only these keeps the helpers
 * testable without inventing a whole DTO, and makes it obvious that search
 * cannot reach fields the row never renders.
 */
export type DeviceListEntry = Pick<
  GetDeviceResponseDTO,
  'id' | 'name' | 'type' | 'provider'
>;

/**
 * Resolves the two labels a row renders next to the device name.
 *
 * Both are functions rather than precomputed strings because they depend on the
 * active language, which the helpers deliberately know nothing about.
 */
export interface DeviceLabels {
  /** `t('device_types.…')` */
  typeLabel: (type: DeviceType) => string;
  /** The provider's brand label — "PetKit", not `petkit`. */
  providerLabel: (provider: string) => string;
}

export const DEVICE_SORT_KEYS = ['type', 'name', 'provider'] as const;
export type DeviceSortKey = (typeof DEVICE_SORT_KEYS)[number];

export interface DeviceSort {
  key: DeviceSortKey;
  direction: SortDirection;
}

/**
 * Narrow a device list to what matches the search box.
 *
 * Matching runs against the *translated* labels rather than the underlying
 * values: the row says "Water Fountain" and "Sure Petcare", so those are the
 * words someone will type. Nobody is searching for `water_fountain` or
 * `surepet`.
 */
export function filterDevices<T extends DeviceListEntry>(
  devices: ReadonlyArray<T>,
  query: string,
  labels: DeviceLabels,
): T[] {
  return devices.filter((device) =>
    matchesSearchQuery(query, [
      device.name,
      labels.typeLabel(device.type),
      labels.providerLabel(device.provider),
    ]),
  );
}

interface SortDevicesOptions {
  labels: DeviceLabels;
  /** Built from the user's regional language tag, not the system default. */
  collator: Intl.Collator;
}

/**
 * Order a device list for display.
 *
 * `type` and `provider` group on the translated label, so the grouping follows
 * the language on screen instead of an enum order that reads as arbitrary once
 * translated. Every mode falls through to name, then id, so two devices that
 * compare equal never swap places between renders.
 */
export function sortDevices<T extends DeviceListEntry>(
  devices: ReadonlyArray<T>,
  { key, direction }: DeviceSort,
  { labels, collator }: SortDevicesOptions,
): T[] {
  const sign = sortDirectionSign(direction);

  /** The label rows are grouped under, or null when sorting by name alone. */
  const groupLabel = (entry: T): string | null => {
    switch (key) {
      case 'type':
        return labels.typeLabel(entry.type);
      case 'provider':
        return labels.providerLabel(entry.provider);
      case 'name':
        return null;
    }
  };

  return [...devices].sort((a, b) => {
    const groupA = groupLabel(a);
    const groupB = groupLabel(b);
    if (groupA !== null && groupB !== null) {
      const byGroup = collator.compare(groupA, groupB);
      if (byGroup !== 0) {
        return byGroup * sign;
      }
    }

    const byName = collator.compare(a.name, b.name);
    if (byName !== 0) {
      return byName * sign;
    }

    /*
     * The id is not on screen, so reversing it too would look like nothing
     * happened while the rows quietly jump around. Descending reverses only
     * what you can actually read.
     */
    return a.id - b.id;
  });
}
