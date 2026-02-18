import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/apiClient';
import {
  type GetEventMediaResponseDTO,
  type PatchEventRequestDTO,
} from 'shared';
import { updateEvent, getVerifiedEventMedia } from '@/api/pets';

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
    onSuccess: () => {
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
