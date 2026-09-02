import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import apiClient from '@/api/apiClient';
import {
  type GetEventDTO,
  type GetEventsResponseDTO,
  type GetEventMediaResponseDTO,
  type PatchEventRequestDTO,
} from 'shared';
import {
  analyzeLitterboxEvent,
  updateEvent,
  deleteEvent,
  getVerifiedEventMedia,
} from '@/api/pets';

/**
 * Replaces one row in every cached `deviceAnnotationEvents` page when present.
 * Call with the server `GetEventDTO` after analyze or PATCH — avoids refetching the whole list.
 */
export function mergeGetEventIntoDeviceAnnotationCaches(
  queryClient: QueryClient,
  event: GetEventDTO,
): void {
  queryClient.setQueriesData<GetEventsResponseDTO | undefined>(
    { queryKey: ['deviceAnnotationEvents'] },
    (old) => {
      if (old?.data == null) return old;
      const idx = old.data.findIndex((e) => e.id === event.id);
      if (idx === -1) return old;
      const nextData = old.data.slice();
      nextData[idx] = event;
      return { ...old, data: nextData };
    },
  );
}

/** Detail query + annotation list rows; does not refetch. Pair with {@link invalidateQueriesAfterEventPatch}. */
export function applyServerEventToEventCaches(
  queryClient: QueryClient,
  event: GetEventDTO,
): void {
  queryClient.setQueryData(['event', event.id], event);
  mergeGetEventIntoDeviceAnnotationCaches(queryClient, event);
}

/**
 * Invalidate list queries that are not updated by {@link applyServerEventToEventCaches}.
 * Call `applyServerEventToEventCaches(queryClient, result)` first when you have the patched event body.
 */
export function invalidateQueriesAfterEventPatch(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['deviceEvents'] });
  queryClient.invalidateQueries({ queryKey: ['petEvents'] });
  // A patched amount moves the overview cards too — the server reconciles
  // calories and the moisture child, so both trends can be stale after any
  // event patch. This is the single funnel every patch path goes through.
  queryClient.invalidateQueries({ queryKey: ['foodTrends'] });
  queryClient.invalidateQueries({ queryKey: ['waterTrends'] });
}

/**
 * PATCH an event and invalidate the same queries as {@link useUpdateEvent}, without using
 * `useMutation`. `useMutation` subscribes via `useSyncExternalStore` and forces a re-render on
 * every mutation state transition — bad for interaction-heavy UIs (e.g. annotation chart drags).
 *
 * TODO: Drag jank may persist — see TODO on `AnnotationWorkspace` chart column.
 */
export function usePatchEvent() {
  const queryClient = useQueryClient();
  const pendingRef = React.useRef(0);
  const [isPatching, setIsPatching] = React.useState(false);

  const patchEvent = React.useCallback(
    async (variables: { eventId: number; data: PatchEventRequestDTO }) => {
      pendingRef.current += 1;
      if (pendingRef.current === 1) setIsPatching(true);
      try {
        const result = await updateEvent(variables.eventId, variables.data);
        applyServerEventToEventCaches(queryClient, result);
        invalidateQueriesAfterEventPatch(queryClient);
        return result;
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current <= 0) {
          pendingRef.current = 0;
          setIsPatching(false);
        }
      }
    },
    [queryClient],
  );

  return { patchEvent, isPatching };
}

export const useEventMedia = (eventId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['events', eventId, 'media'],
    queryFn: async () => {
      const response = await apiClient.get<GetEventMediaResponseDTO>(
        `events/${eventId}/media`,
      );
      return response.data;
    },
    enabled,
  });
};

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      data,
    }: {
      eventId: number;
      data: PatchEventRequestDTO;
    }) => updateEvent(eventId, data),
    onSuccess: (data) => {
      applyServerEventToEventCaches(queryClient, data);
      invalidateQueriesAfterEventPatch(queryClient);
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: number) => deleteEvent(eventId),
    onSuccess: (_data, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['deviceEvents'] });
      queryClient.invalidateQueries({ queryKey: ['petEvents'] });
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
    },
  });
}

export function useAnalyzeLitterboxEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: number) => analyzeLitterboxEvent(eventId),
    onSuccess: (data) => {
      applyServerEventToEventCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['deviceEvents'] });
      queryClient.invalidateQueries({ queryKey: ['petEvents'] });
    },
  });
}

export const useVerifiedEventMedia = (
  deviceId: number,
  petId: number,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ['verifiedEventMedia', deviceId, petId],
    queryFn: () => getVerifiedEventMedia(deviceId, petId),
    enabled,
  });
};
