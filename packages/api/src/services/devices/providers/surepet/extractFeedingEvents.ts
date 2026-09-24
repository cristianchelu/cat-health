import { isRecord } from 'shared';
import { createHash } from 'node:crypto';
import type {
  EventCauseDTO,
  ProviderPetLink,
  SurePetAccountConfig,
} from 'shared';
import { getLinkRemotePetId, getLinkTagId } from './petLinkResolvers.ts';
import type {
  NormalizedFeedingDatapoint,
  NormalizedServedDatapoint,
} from './types.ts';
import {
  FoodType,
  SubstanceType,
  TimelineEventType,
  WeightContext,
} from './constants.ts';
import type {
  SurePetConsumptionRecord,
  SurePetFeedingDatapoint,
  SurePetHouseholdReportPair,
  SurePetTimelineEntry,
  SurePetTimelineEntryData,
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

/**
 * A timeline entry's `data` arrives as a JSON string, so every read of it goes
 * through here. Malformed payloads are simply absent rather than fatal — the
 * weights carry the amounts, and this only enriches them.
 */
function parseTimelineEntryData(
  entry: SurePetTimelineEntry,
): SurePetTimelineEntryData | undefined {
  const raw = getString(entry.data);
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as SurePetTimelineEntryData) : undefined;
  } catch {
    return undefined;
  }
}

/** `FoodType` configured for one hardware bowl, from the entry's own payload. */
function foodTypeIdForBowl(
  data: SurePetTimelineEntryData | undefined,
  bowlIndex: number,
): number | undefined {
  const types = data?.weight?.food_type;
  if (!Array.isArray(types)) return undefined;
  return getNumber(types[bowlIndex]);
}

/**
 * What a weight record is a record OF.
 *
 * `context` is the authority when present: it is the only field that separates
 * a recognised pet from an intruder, and a fill from a tare. Records that
 * predate it fall back to the entry type, which is how this always read.
 */
type WeightRecordRole =
  | { kind: 'consumption'; cause: EventCauseDTO }
  | { kind: 'served' }
  | { kind: 'ignore' };

function resolveWeightRecordRole(
  record: SurePetTimelineWeightRecord,
  entry: SurePetTimelineEntry,
): WeightRecordRole {
  const context = getNumber(record.context);

  if (context != null) {
    switch (context) {
      case WeightContext.PET_CLOSED:
        return { kind: 'consumption', cause: 'pet' };
      case WeightContext.INTRUDER_CLOSED:
        // The feeder saw an animal it could not identify. Recording it as a
        // meal for whichever tag is attached would invent an identification.
        return { kind: 'consumption', cause: 'other_animal' };
      case WeightContext.DUBIOUS_CLOSED:
        // The hardware distrusts its own reading; we keep the grams and leave
        // the cause for a human to settle.
        return { kind: 'consumption', cause: 'unknown' };
      case WeightContext.USER_CLOSED:
        return { kind: 'served' };
      default:
        // PET_OPENED / USER_OPENED carry no settled weights, and USER_ZEROED is
        // a tare whose frames are an artefact of zeroing, not food moving.
        return { kind: 'ignore' };
    }
  }

  if (entry.type === TimelineEventType.PET_HAS_EATEN) {
    return { kind: 'consumption', cause: 'pet' };
  }
  if (entry.type === TimelineEventType.BOWL_FILLED) {
    return { kind: 'served' };
  }
  return { kind: 'ignore' };
}

export function expandTimelineWeightRecordToDatapoints(
  record: SurePetTimelineWeightRecord,
  entry: SurePetTimelineEntry,
  timelineEntryId?: number,
): NormalizedFeedingDatapoint[] {
  const role = resolveWeightRecordRole(record, entry);
  if (role.kind !== 'consumption') return [];

  const from = parseDate(record.created_at) ?? parseDate(entry.created_at);
  if (!from) return [];

  const tag_id = getNumber(record.tag_id);
  const device_id = getNumber(record.device_id);
  // Only a recognised pet gets to keep the tag's identification. An intruder
  // or a dubious reading may still carry a tag id; it just does not mean what
  // it would on a `PET_CLOSED` record.
  const pet_id =
    role.cause === 'pet'
      ? resolvePetIdFromTimelineEntry(entry, tag_id)
      : undefined;
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
      cause: role.cause,
    });
  }

  return datapoints;
}

/**
 * A person filling the bowl, expanded per bowl that gained food.
 *
 * The mirror of the consumption walk above: that one keeps negative frames,
 * this one keeps positive ones. `current_weight` is the level the bowl reached,
 * so the level before is simply what is left once the addition is taken back
 * out — which is what tells a fresh bowl from a top-up onto leftovers.
 */
export function expandTimelineWeightRecordToServed(
  record: SurePetTimelineWeightRecord,
  entry: SurePetTimelineEntry,
  timelineEntryId?: number,
): NormalizedServedDatapoint[] {
  if (resolveWeightRecordRole(record, entry).kind !== 'served') return [];

  const from = parseDate(record.created_at) ?? parseDate(entry.created_at);
  if (!from) return [];

  const device_id = getNumber(record.device_id);
  const entryData = parseTimelineEntryData(entry);
  const served: NormalizedServedDatapoint[] = [];

  for (const frame of record.frames ?? []) {
    const change = getNumber(frame.change);
    if (change == null || change <= 0) continue;

    const bowl_index = getNumber(frame.index) ?? 0;
    const level_after_g = getNumber(frame.current_weight);
    const source_id = `timeline-served:${timelineEntryId ?? ''}:${record.id ?? ''}:${from.toISOString()}:${device_id ?? ''}:${bowl_index}:${change}`;

    served.push({
      from,
      amount_g: change,
      device_id,
      bowl_index,
      ...(level_after_g != null
        ? { level_before_g: level_after_g - change, level_after_g }
        : {}),
      food_type_id: foodTypeIdForBowl(entryData, bowl_index),
      timeline_entry_id: timelineEntryId,
      source_id,
    });
  }

  return served;
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

  for (let i = 0; i < (datapoint.weights?.length ?? 0); i++) {
    // `change` is the amount; `weight` beside it is the bowl's level once the
    // animal left. Reading the level here records a 3 g nibble from a full bowl
    // as a 59 g meal, and `actual_weight` is worse still — the feeder's current
    // reading, repeated identically on every datapoint in the response.
    const change = getNumber(datapoint.weights?.[i]?.change);
    if (change == null || change >= 0) continue;

    const amount_g = Math.abs(change);
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
      cause: 'pet',
    });
  }

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
      cause: 'pet',
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
      cause: 'pet',
    },
  ];
}

/**
 * One walk of the timeline, yielding both directions food moves: what animals
 * took out of the bowls, and what people put in.
 */
export function extractFeedingDatapointsFromTimeline(
  entries: SurePetTimelineEntry[],
): {
  datapoints: NormalizedFeedingDatapoint[];
  served: NormalizedServedDatapoint[];
  maxEntryId: number | null;
} {
  const datapoints: NormalizedFeedingDatapoint[] = [];
  const served: NormalizedServedDatapoint[] = [];
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

    // Every weights-bearing entry is walked, not just `PET_HAS_EATEN`: the
    // record's own `context` decides what it is, and a fill lives on a
    // `BOWL_FILLED` entry that the old type gate discarded.
    if (Array.isArray(entry.weights)) {
      for (const weight of entry.weights) {
        datapoints.push(
          ...expandTimelineWeightRecordToDatapoints(weight, entry, entryId),
        );
        served.push(
          ...expandTimelineWeightRecordToServed(weight, entry, entryId),
        );
      }
    }
  }

  return { datapoints, served, maxEntryId };
}

/**
 * The per-pet aggregate report, when we have one.
 *
 * SurePet retired `/api/report/household/{id}` and `/api/pet/{id}/report`; both
 * answer 404. Their replacement is per-pet and carries no fills, so the full
 * timeline walk is the backfill now and this is kept only for payloads that
 * still arrive embedded in a timeline entry.
 */
export function extractFeedingDatapointsFromReportPairs(
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

/** One bowl's `FoodType` id, as the food vocabulary the rest of the app uses. */
export function foodTypeFromId(
  foodTypeId: number | undefined,
): 'dry' | 'wet' | 'unknown' {
  if (foodTypeId === FoodType.WET) return 'wet';
  if (foodTypeId === FoodType.DRY) return 'dry';
  return 'unknown';
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
    const [only] = [...foodTypes];
    return foodTypeFromId(only);
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
