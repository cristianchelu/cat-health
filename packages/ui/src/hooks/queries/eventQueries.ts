import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import apiClient from '@/api/apiClient';
import {
  type GetEventMediaResponseDTO,
  type PatchEventRequestDTO,
} from 'shared';
import {
  analyzeLitterboxEvent,
  updateEvent,
  deleteEvent,
  getVerifiedEventMedia,
} from '@/api/pets';

/** Shared with `useUpdateEvent` and `usePatchEvent` (mutation `onSuccess`). */
export function invalidateQueriesAfterEventPatch(
  queryClient: QueryClient,
  eventId: number,
) {
  queryClient.invalidateQueries({ queryKey: ['deviceEvents'] });
  queryClient.invalidateQueries({ queryKey: ['deviceAnnotationEvents'] });
  queryClient.invalidateQueries({ queryKey: ['petEvents'] });
  queryClient.invalidateQueries({ queryKey: ['event', eventId] });
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
        invalidateQueriesAfterEventPatch(queryClient, variables.eventId);
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
    onSuccess: (_data, variables) => {
      invalidateQueriesAfterEventPatch(queryClient, variables.eventId);
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
    onSuccess: (_data, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['deviceEvents'] });
      queryClient.invalidateQueries({ queryKey: ['deviceAnnotationEvents'] });
      queryClient.invalidateQueries({ queryKey: ['petEvents'] });
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
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
