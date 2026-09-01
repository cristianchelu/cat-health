import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type GetEventChildDTO,
  type GetEventListItemDTO,
  type GetEventWithChildrenDTO,
} from 'shared';
import { addEvent } from '@/api/pets';
import { reidentifyLitterboxVisits } from '@/api/devices';
import {
  invalidateQueriesAfterEventPatch,
  useDeleteEvent,
  useUpdateEvent,
} from '@/hooks/queries/eventQueries';

export const MIN_WEIGHT_G = 500;
export const MAX_WEIGHT_G = 20_000;

export type LitterboxWeightParentEvent =
  | GetEventWithChildrenDTO
  | (GetEventListItemDTO & { children?: GetEventChildDTO[] });

/** The cat's weight is a child `weight_measurement` of the visit, not a field on it. */
export function findWeightChild(
  parent: LitterboxWeightParentEvent,
): GetEventChildDTO | undefined {
  return parent.children?.find(
    (child) => child.data.type === 'weight_measurement',
  );
}

export function gramsToKgInput(grams: number): string {
  return (grams / 1000).toFixed(2);
}

export function gramsToKgDisplay(grams: number): string {
  return `${gramsToKgInput(grams)} kg`;
}

/** `null` for blank — the caller reads that as "remove the reading", not as zero. */
export function parseKgInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const kg = Number.parseFloat(trimmed);
  if (!Number.isFinite(kg)) return null;
  return Math.round(kg * 1000);
}

export class WeightOutOfRangeError extends Error {}

/**
 * Writing a visit's cat weight, in the three shapes it takes: correct the
 * reading, add one the sensor never took, or remove one we know is false.
 *
 * Removal deletes the child rather than flagging it: for a reading that is
 * wrong — a zero, a double, two cats on the plate — keeping-but-excluding and
 * deleting are the same analytics outcome, and the visit itself survives
 * either way.
 *
 * Shared by the edit form and the annotation workspace so the two cannot drift
 * on what a weight edit invalidates.
 */
export function useLitterboxWeightEdit(
  parentEvent: LitterboxWeightParentEvent,
) {
  const queryClient = useQueryClient();
  const { mutateAsync: updateEvent, isPending: isUpdating } = useUpdateEvent();
  const { mutateAsync: deleteEvent, isPending: isDeleting } = useDeleteEvent();

  const weightChild = findWeightChild(parentEvent);
  const weightGrams =
    weightChild?.data.type === 'weight_measurement'
      ? weightChild.data.weight
      : null;

  const refreshAfterChange = React.useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['event', parentEvent.id],
    });
    invalidateQueriesAfterEventPatch(queryClient);
    if (parentEvent.pet_id != null) {
      await queryClient.invalidateQueries({
        queryKey: ['weightTrends', parentEvent.pet_id],
      });
    }
  }, [parentEvent.id, parentEvent.pet_id, queryClient]);

  const saveWeight = React.useCallback(
    async (grams: number | null, options: { reidentify?: boolean } = {}) => {
      if (grams === null) {
        if (weightChild) await deleteEvent(weightChild.id);
      } else if (grams < MIN_WEIGHT_G || grams > MAX_WEIGHT_G) {
        throw new WeightOutOfRangeError();
      } else if (weightChild) {
        await updateEvent({
          eventId: weightChild.id,
          data: {
            data: { type: 'weight_measurement', weight: grams },
            human_verified: true,
          },
        });
      } else {
        await addEvent({
          parent_event_id: parentEvent.id,
          pet_id: parentEvent.pet_id,
          device_id: parentEvent.device_id,
          timestamp: parentEvent.timestamp,
          data: { type: 'weight_measurement', weight: grams },
          human_verified: true,
        });
      }

      if (options.reidentify && parentEvent.device_id != null) {
        await reidentifyLitterboxVisits(
          parentEvent.device_id,
          parentEvent.timestamp,
        );
        invalidateQueriesAfterEventPatch(queryClient);
        await queryClient.invalidateQueries({ queryKey: ['litterboxTrends'] });
      }

      await refreshAfterChange();
    },
    [
      deleteEvent,
      parentEvent.device_id,
      parentEvent.id,
      parentEvent.pet_id,
      parentEvent.timestamp,
      queryClient,
      refreshAfterChange,
      updateEvent,
      weightChild,
    ],
  );

  return {
    weightChild,
    weightGrams,
    saveWeight,
    isSaving: isUpdating || isDeleting,
  };
}
