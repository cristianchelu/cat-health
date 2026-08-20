import { isRecord } from 'shared';
import { createHash } from 'node:crypto';
import type { ProviderPetLink, SurePetAccountConfig } from 'shared';
import { getLinkRemotePetId, getLinkTagId } from './petLinkResolvers.ts';
import type { NormalizedFeedingDatapoint } from './types.ts';
import { SubstanceType, TimelineEventType } from './constants.ts';
import type {
  SurePetConsumptionRecord,
  SurePetFeedingDatapoint,
  SurePetHouseholdReportPair,
  SurePetTimelineEntry,
  SurePetTimelineWeightRecord,
} from './types.ts';

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
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

function sumNegativeChanges(change: number[] | null | undefined): number {
  if (!change?.length) return 0;
  let eaten = 0;
  for (const value of change) {
    if (typeof value === 'number' && value < 0) {
      eaten += Math.abs(value);
    }
  }
  return eaten;
}

function resolvePetIdFromTimelineEntry(
  entry: SurePetTimelineEntry,
  tagId: number | undefined,
): number | undefined {
  if (tagId == null || !Array.isArray(entry.pets)) return undefined;
  const pet = entry.pets.find(
    (candidate) => getNumber(candidate.tag_id) === tagId,
  );
  return getNumber(pet?.id);
}

export function expandTimelineWeightRecordToDatapoints(
  record: SurePetTimelineWeightRecord,
  entry: SurePetTimelineEntry,
  timelineEntryId?: number,
): NormalizedFeedingDatapoint[] {
  const from = parseDate(record.created_at) ?? parseDate(entry.created_at);
  if (!from) return [];

  const tag_id = getNumber(record.tag_id);
  const device_id = getNumber(record.device_id);
  const pet_id = resolvePetIdFromTimelineEntry(entry, tag_id);
  const duration_s = getNumber(record.duration);
  const datapoints: NormalizedFeedingDatapoint[] = [];

  for (const frame of record.frames ?? []) {
    const change = getNumber(frame.change);
    if (change == null || change >= 0) continue;

    const bowl_index = getNumber(frame.index) ?? 0;
    const amount_g = Math.abs(change);
    const source_id = `timeline-weight:${timelineEntryId ?? ''}:${record.id ?? ''}:${from.toISOString()}:${device_id ?? ''}:${tag_id ?? ''}:${bowl_index}:${amount_g}`;

    datapoints.push({
      from,
      duration_s,
      amount_g,
      tag_id,
      device_id,
      pet_id,
      timeline_entry_id: timelineEntryId,
      source_id,
      bowl_index,
    });
  }

  return datapoints;
}

export function buildFeedingExternalKey(input: {
  device_id?: number;
  tag_id?: number;
  from: Date;
  amount_g: number;
  source_id: string;
  bowl_index?: number;
}): string {
  const payload = [
    input.device_id ?? '',
    input.tag_id ?? '',
    input.from.toISOString(),
    input.amount_g,
    input.source_id,
    input.bowl_index ?? '',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

function expandReportDatapointToDatapoints(
  datapoint: SurePetFeedingDatapoint,
  options: {
    timeline_entry_id?: number;
    pet_id?: number;
    sourcePrefix: string;
  },
): NormalizedFeedingDatapoint[] {
  const from = parseDate(datapoint.from);
  if (!from) return [];

  const tag_id = getNumber(datapoint.tag_id);
  const device_id = getNumber(datapoint.device_id);
  const pet_id = getNumber(datapoint.pet_id) ?? options.pet_id;
  const to = parseDate(datapoint.to);
  const duration_s = getNumber(datapoint.duration);
  const results: NormalizedFeedingDatapoint[] = [];

  if (datapoint.weights?.length) {
    for (let i = 0; i < datapoint.weights.length; i++) {
      const amount_g = Math.abs(getNumber(datapoint.weights[i]?.weight) ?? 0);
      if (amount_g <= 0) continue;

      const source_id = `${options.sourcePrefix}:${datapoint.from}:${device_id ?? ''}:${tag_id ?? ''}:${i}:${amount_g}`;
      results.push({
        from,
        to,
        duration_s,
        amount_g,
        tag_id,
        device_id,
        pet_id,
        timeline_entry_id: options.timeline_entry_id,
        source_id,
        bowl_index: i,
      });
    }
    if (results.length > 0) return results;
  }

  const amount = getNumber(datapoint.actual_weight) ?? undefined;
  if (amount == null || amount <= 0) return [];

  const source_id = `${options.sourcePrefix}:${datapoint.from}:${device_id ?? ''}:${tag_id ?? ''}:${amount}`;
  results.push({
    from,
    to,
    duration_s,
    amount_g: amount,
    tag_id,
    device_id,
    pet_id,
    timeline_entry_id: options.timeline_entry_id,
    source_id,
  });

  return results;
}

function expandConsumptionToDatapoints(
  record: SurePetConsumptionRecord,
  timelineEntryId?: number,
): NormalizedFeedingDatapoint[] {
  const at = parseDate(record.at);
  if (!at) return [];

  const tag_id = getNumber(record.tag_id);
  const device_id = getNumber(record.device_id);
  const changes = record.change ?? [];
  const datapoints: NormalizedFeedingDatapoint[] = [];

  for (let i = 0; i < changes.length; i++) {
    const change = getNumber(changes[i]);
    if (change == null || change >= 0) continue;

    const amount_g = Math.abs(change);
    const source_id = `consumption:${record.id ?? ''}:${at.toISOString()}:${device_id ?? ''}:${tag_id ?? ''}:${i}:${amount_g}`;
    datapoints.push({
      from: at,
      amount_g,
      tag_id,
      device_id,
      timeline_entry_id: timelineEntryId,
      source_id,
      bowl_index: i,
    });
  }

  if (datapoints.length > 0) return datapoints;

  const total = sumNegativeChanges(changes);
  if (total <= 0) return [];

  const source_id = `consumption:${record.id ?? ''}:${at.toISOString()}:${device_id ?? ''}:${tag_id ?? ''}:${total}`;
  return [
    {
      from: at,
      amount_g: total,
      tag_id,
      device_id,
      timeline_entry_id: timelineEntryId,
      source_id,
    },
  ];
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
        datapoints.push(...expandConsumptionToDatapoints(consumption, entryId));
      }
    }

    const reportDatapoints = entry.feeding?.datapoints;
    if (Array.isArray(reportDatapoints)) {
      for (const datapoint of reportDatapoints) {
        datapoints.push(
          ...expandReportDatapointToDatapoints(datapoint, {
            timeline_entry_id: entryId,
            sourcePrefix: `timeline:${entryId ?? 'unknown'}`,
          }),
        );
      }
    }

    if (
      entry.type === TimelineEventType.PET_HAS_EATEN &&
      Array.isArray(entry.weights)
    ) {
      for (const weight of entry.weights) {
        datapoints.push(
          ...expandTimelineWeightRecordToDatapoints(weight, entry, entryId),
        );
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
      datapoints.push(
        ...expandReportDatapointToDatapoints(datapoint, {
          pet_id: cloudPetId,
          sourcePrefix: `report:${cloudPetId ?? 'unknown'}:${pair.device_id ?? 'unknown'}`,
        }),
      );
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
    const byTag = links.find((link) => getLinkTagId(link) === datapoint.tag_id);
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
  pets: Array<{
    id: number;
    tag_id?: number | null;
    tag?: { id: number } | null;
  }>,
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
      metadata: {
        ...(isRecord(link.metadata) ? link.metadata : {}),
        tag_id: tagId,
      },
    };
  });
}

export function resolveLocalPetIdFromProviderData(
  config: SurePetAccountConfig,
  providerData: {
    tag_id?: number;
    pet_id?: number;
  },
): number | null {
  return resolveLocalPetId(config, {
    from: new Date(0),
    amount_g: 0,
    source_id: 'backfill',
    tag_id: providerData.tag_id,
    pet_id: providerData.pet_id,
  });
}
