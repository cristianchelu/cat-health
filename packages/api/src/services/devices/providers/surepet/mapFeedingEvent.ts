import type { SurePetAccountConfig } from 'shared';
import type {
  FoodIntakeEventData,
  NewEvent,
} from '../../../../database/types/EventTable.ts';
import type { NormalizedFeedingDatapoint } from './types.ts';
import {
  buildFeedingExternalKey,
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

  const total =
    totalTarget > 0 ? (totalWeight / totalTarget) * 100 : null;

  return { total, per_bowl };
}
