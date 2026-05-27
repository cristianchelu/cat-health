import { createHash } from 'node:crypto';
import type { ProviderPetLink, SurePetAccountConfig } from 'shared';
import {
  getLinkRemotePetId,
  getLinkTagId,
} from './petLinkResolvers.ts';
import type { NormalizedFeedingDatapoint } from './types.ts';
import { SubstanceType } from './constants.ts';
import type {
  SurePetConsumptionRecord,
  SurePetFeedingDatapoint,
  SurePetHouseholdReportPair,
  SurePetTimelineEntry,
} from './types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseDate(value: unknown): Date | undefined {
  const str = getString(value);
  if (!str) return undefined;
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function sumAbsoluteChanges(change: number[] | null | undefined): number {
  if (!change?.length) return 0;
  return change.reduce((sum, value) => sum + Math.abs(value), 0);
}

export function buildFeedingExternalKey(input: {
  device_id?: number;
  tag_id?: number;
  from: Date;
  amount_g: number;
  source_id: string;
}): string {
  const payload = [
    input.device_id ?? '',
    input.tag_id ?? '',
    input.from.toISOString(),
    input.amount_g,
    input.source_id,
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

function normalizeReportDatapoint(
  datapoint: SurePetFeedingDatapoint,
  options: {
    timeline_entry_id?: number;
    pet_id?: number;
    sourcePrefix: string;
  },
): NormalizedFeedingDatapoint | null {
  const from = parseDate(datapoint.from);
  if (!from) return null;

  const amount =
    getNumber(datapoint.actual_weight) ??
    (datapoint.weights?.length
      ? Math.abs(
          datapoint.weights.reduce(
            (max, frame) =>
              Math.max(max, Math.abs(getNumber(frame.weight) ?? 0)),
            0,
          ),
        )
      : undefined);

  if (amount == null || amount <= 0) return null;

  const source_id = `${options.sourcePrefix}:${datapoint.from}:${datapoint.device_id ?? ''}:${datapoint.tag_id ?? ''}:${amount}`;

  return {
    from,
    to: parseDate(datapoint.to),
    duration_s: getNumber(datapoint.duration),
    amount_g: amount,
    tag_id: getNumber(datapoint.tag_id),
    device_id: getNumber(datapoint.device_id),
    pet_id: getNumber(datapoint.pet_id) ?? options.pet_id,
    timeline_entry_id: options.timeline_entry_id,
    source_id,
  };
}

function normalizeConsumption(
  record: SurePetConsumptionRecord,
  timelineEntryId?: number,
): NormalizedFeedingDatapoint | null {
  const at = parseDate(record.at);
  if (!at) return null;

  const amount = sumAbsoluteChanges(record.change ?? undefined);
  if (amount <= 0) return null;

  const source_id = `consumption:${record.id ?? ''}:${at.toISOString()}:${record.device_id ?? ''}:${record.tag_id ?? ''}`;

  return {
    from: at,
    amount_g: amount,
    tag_id: getNumber(record.tag_id),
    device_id: getNumber(record.device_id),
    timeline_entry_id: timelineEntryId,
    source_id,
  };
}

export function extractFeedingDatapointsFromTimeline(
  entries: SurePetTimelineEntry[],
): { datapoints: NormalizedFeedingDatapoint[]; maxEntryId: number | null } {
  const datapoints: NormalizedFeedingDatapoint[] = [];
  let maxEntryId: number | null = null;

  for (const entry of entries) {
    const entryId = getNumber(entry.id);
    if (entryId != null) {
      maxEntryId = maxEntryId == null ? entryId : Math.max(maxEntryId, entryId);
    }

    if (Array.isArray(entry.consumptions)) {
      for (const consumption of entry.consumptions) {
        if (consumption.substance_type !== SubstanceType.FOOD) {
          continue;
        }
        const normalized = normalizeConsumption(consumption, entryId);
        if (normalized) datapoints.push(normalized);
      }
    }

    const reportDatapoints = entry.feeding?.datapoints;
    if (Array.isArray(reportDatapoints)) {
      for (const datapoint of reportDatapoints) {
        const normalized = normalizeReportDatapoint(datapoint, {
          timeline_entry_id: entryId,
          sourcePrefix: `timeline:${entryId ?? 'unknown'}`,
        });
        if (normalized) datapoints.push(normalized);
      }
    }
  }

  return { datapoints, maxEntryId };
}

export function extractFeedingDatapointsFromHouseholdReport(
  data: unknown,
): NormalizedFeedingDatapoint[] {
  if (!Array.isArray(data)) return [];

  const datapoints: NormalizedFeedingDatapoint[] = [];

  for (const pair of data as SurePetHouseholdReportPair[]) {
    const cloudPetId = getNumber(pair.pet_id);
    const reportDatapoints = pair.feeding?.datapoints;
    if (!Array.isArray(reportDatapoints)) continue;

    for (const datapoint of reportDatapoints) {
      const normalized = normalizeReportDatapoint(datapoint, {
        pet_id: cloudPetId,
        sourcePrefix: `report:${cloudPetId ?? 'unknown'}:${pair.device_id ?? 'unknown'}`,
      });
      if (normalized) datapoints.push(normalized);
    }
  }

  return datapoints;
}

export function resolveLocalPetId(
  config: SurePetAccountConfig,
  datapoint: NormalizedFeedingDatapoint,
): number | null {
  const links = config.pet_links ?? [];

  if (datapoint.pet_id != null) {
    const byPetId = links.find(
      (link) => getLinkRemotePetId(link) === datapoint.pet_id,
    );
    if (byPetId) return byPetId.pet_id;
  }

  if (datapoint.tag_id != null) {
    const byTag = links.find(
      (link) => getLinkTagId(link) === datapoint.tag_id,
    );
    if (byTag) return byTag.pet_id;
  }

  return null;
}

export function inferFoodTypeFromDeviceControl(
  control: unknown,
): 'dry' | 'wet' | 'unknown' {
  if (!isRecord(control)) return 'unknown';
  const bowls = control.bowls;
  if (!isRecord(bowls)) return 'unknown';
  const settings = bowls.settings;
  if (!Array.isArray(settings) || settings.length === 0) return 'unknown';

  const foodTypes = new Set<number>();
  for (const setting of settings) {
    if (!isRecord(setting)) continue;
    const foodType = getNumber(setting.food_type);
    if (foodType != null) foodTypes.add(foodType);
  }

  if (foodTypes.size === 1) {
    if (foodTypes.has(1)) return 'wet';
    if (foodTypes.has(2)) return 'dry';
  }

  return 'unknown';
}

export function refreshPetLinkTagIds(
  links: ProviderPetLink[],
  pets: Array<{ id: number; tag_id?: number | null; tag?: { id: number } | null }>,
): ProviderPetLink[] {
  if (!links.length) return links;

  const tagByPetId = new Map<number, number>();
  for (const pet of pets) {
    const tagId = getNumber(pet.tag_id) ?? getNumber(pet.tag?.id);
    if (tagId != null) tagByPetId.set(pet.id, tagId);
  }

  return links.map((link) => {
    const remotePetId = getLinkRemotePetId(link);
    if (remotePetId == null) return link;
    const tagId = tagByPetId.get(remotePetId);
    if (tagId == null) return link;
    return {
      ...link,
      metadata: { ...(isRecord(link.metadata) ? link.metadata : {}), tag_id: tagId },
    };
  });
}
