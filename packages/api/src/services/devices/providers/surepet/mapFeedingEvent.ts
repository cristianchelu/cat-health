import type { SurePetAccountConfig } from 'shared';
import type { NewEvent } from '../../../../database/types/EventTable.ts';
import type {
  FoodIntakeEventData,
  FoodServedEventData,
} from '../../../../domain/events.ts';
import type {
  NormalizedFeedingDatapoint,
  NormalizedServedDatapoint,
} from './types.ts';
import {
  buildFeedingExternalKey,
  foodTypeFromId,
  inferFoodTypeFromDeviceControl,
  resolveLocalPetId,
} from './extractFeedingEvents.ts';
import { shouldIncludeBowlIndexOnProviderData } from './foodCompartments.ts';

export function mapFeedingDatapointToEvent(options: {
  datapoint: NormalizedFeedingDatapoint;
  localDeviceId: number;
  accountConfig: SurePetAccountConfig;
  deviceControl?: unknown;
}): NewEvent<FoodIntakeEventData> {
  const { datapoint, localDeviceId, accountConfig, deviceControl } = options;

  const external_key = buildFeedingExternalKey({
    device_id: datapoint.device_id,
    tag_id: datapoint.tag_id,
    from: datapoint.from,
    amount_g: datapoint.amount_g,
    source_id: datapoint.source_id,
    bowl_index: datapoint.bowl_index,
  });

  const includeBowlIndex = shouldIncludeBowlIndexOnProviderData(deviceControl);

  return {
    pet_id: resolveLocalPetId(accountConfig, datapoint),
    device_id: localDeviceId,
    timestamp: datapoint.from,
    data: {
      type: 'food_intake',
      food_type: inferFoodTypeFromDeviceControl(deviceControl),
      amount: Math.round(datapoint.amount_g),
      provider_data: {
        provider: 'surepet',
        external_key,
        tag_id: datapoint.tag_id,
        device_id: datapoint.device_id,
        pet_id: datapoint.pet_id,
        duration_s: datapoint.duration_s,
        timeline_entry_id: datapoint.timeline_entry_id,
        ...(includeBowlIndex && datapoint.bowl_index != null
          ? { bowl_index: datapoint.bowl_index }
          : {}),
      },
    },
    raw_data: null,
    human_verified: true,
  };
}

/**
 * A serving — food going into the bowl — as an event.
 *
 * No `pet_id` by construction: a SureFeed has no motor, so every gram that
 * appears in its bowl was put there by a person. The caller stamps that on the
 * row as `caused_by: 'human'`; nothing here has to guess.
 *
 * The food type comes off the entry's own per-bowl payload where the meal path
 * has to infer one for the whole device, so a feeder with dry on one side and
 * wet on the other is answered correctly rather than as `unknown`.
 */
export function mapServedDatapointToEvent(options: {
  datapoint: NormalizedServedDatapoint;
  localDeviceId: number;
  deviceControl?: unknown;
}): NewEvent<FoodServedEventData> {
  const { datapoint, localDeviceId, deviceControl } = options;

  const external_key = buildFeedingExternalKey({
    device_id: datapoint.device_id,
    from: datapoint.from,
    amount_g: datapoint.amount_g,
    source_id: datapoint.source_id,
    bowl_index: datapoint.bowl_index,
  });

  const includeBowlIndex = shouldIncludeBowlIndexOnProviderData(deviceControl);
  const food_type =
    datapoint.food_type_id != null
      ? foodTypeFromId(datapoint.food_type_id)
      : inferFoodTypeFromDeviceControl(deviceControl);

  return {
    device_id: localDeviceId,
    timestamp: datapoint.from,
    data: {
      type: 'food_served',
      food_type,
      amount: Math.round(datapoint.amount_g),
      ...(datapoint.level_before_g != null && datapoint.level_after_g != null
        ? {
            level_before: Math.round(datapoint.level_before_g),
            level_after: Math.round(datapoint.level_after_g),
          }
        : {}),
      provider_data: {
        provider: 'surepet',
        external_key,
        device_id: datapoint.device_id,
        timeline_entry_id: datapoint.timeline_entry_id,
        ...(includeBowlIndex ? { bowl_index: datapoint.bowl_index } : {}),
      },
    },
    raw_data: null,
    human_verified: false,
  };
}

export function computeFillPercentages(
  bowlStatus: Array<{ current_weight?: number | null }> | undefined,
  bowlSettings: Array<{ target?: number | null } | null> | undefined,
): {
  total: number | null;
  per_bowl: Record<string, number | null>;
} {
  if (!bowlStatus?.length || !bowlSettings?.length) {
    return { total: null, per_bowl: {} };
  }

  let totalWeight = 0;
  let totalTarget = 0;
  const per_bowl: Record<string, number | null> = {};

  for (let i = 0; i < bowlStatus.length; i++) {
    const weight = bowlStatus[i]?.current_weight;
    const target = bowlSettings[i]?.target ?? 0;

    if (weight != null && target > 0) {
      const percent = (weight / target) * 100;
      per_bowl[String(i)] = percent;
      totalWeight += weight;
      totalTarget += target;
    } else {
      per_bowl[String(i)] = null;
    }
  }

  const total = totalTarget > 0 ? (totalWeight / totalTarget) * 100 : null;

  return { total, per_bowl };
}
