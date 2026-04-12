import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';

import {
  deleteEvent,
  getPetEvents,
  getPets,
  getPetWeightTrends,
  getPetWaterTrends,
  getPetLitterboxTrends,
  updateEvent,
  getPet,
  createPet,
  updatePet,
  deletePet,
} from '@/api/pets';
import type {
  PostPetRequestDTO,
  PatchPetRequestDTO,
  PatchEventRequestDTO,
} from 'shared';
import { dateRangeToTimeRange, type DateRange } from '@/lib/utils';

export function usePets() {
  return useQuery({
    queryKey: ['pets'],
    queryFn: () => getPets(),
  });
}

// TODO: create the darned api route
export function usePet(petId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['pet', petId],
    queryFn: () => getPet(petId),
    enabled,
  });
}

export function usePetEvents(
  petId: number,
  currentDateRange: DateRange,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['petEvents', petId, currentDateRange],
    queryFn: () => {
      const { startTime, endTime } = dateRangeToTimeRange(currentDateRange);
      return getPetEvents(petId, startTime, endTime, 5000);
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useDeleteEvent(petId: number, currentDateRange: DateRange) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: number) => deleteEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['petEvents', petId, currentDateRange],
      });
    },
  });
}

export function useUpdateEvent(petId: number, currentDateRange: DateRange) {
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
      queryClient.invalidateQueries({
        queryKey: ['petEvents', petId, currentDateRange],
      });
    },
  });
}

export function usePetWeightTrends(petId: number, days: number) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return useQuery({
    queryKey: ['weightTrends', petId, days, timezone],
    queryFn: () => getPetWeightTrends(petId, { days, timezone }),
  });
}

export function usePetWaterTrends(petId: number, days: number) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return useQuery({
    queryKey: ['waterTrends', petId, days, timezone],
    queryFn: () => getPetWaterTrends(petId, { days, timezone }),
  });
}

export function usePetLitterboxTrends(petId: number, days: number) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return useQuery({
    queryKey: ['litterboxTrends', petId, days, timezone],
    queryFn: () => getPetLitterboxTrends(petId, { days, timezone }),
  });
}

export function useCreatePet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PostPetRequestDTO) => createPet(data),
    onSuccess: (newPet) => {
      // Invalidate and update cache optimistically
      queryClient.invalidateQueries({ queryKey: ['pets'] });
      queryClient.setQueryData(['pet', newPet.id], newPet);
    },
  });
}

export function useUpdatePet(petId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PatchPetRequestDTO) => updatePet(petId, data),
    onSuccess: (updatedPet) => {
      queryClient.invalidateQueries({ queryKey: ['pets'] });
      queryClient.setQueryData(['pet', petId], updatedPet);
    },
  });
}

// Upload avatar for a pet
export function useUploadPetAvatar(petId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('avatar', file);
      const res = await fetch(`api/pets/${petId}/avatar`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        throw new Error('Failed to upload avatar');
      }
      return (await res.json()) as {
        success: boolean;
        avatar?: { url: string; width: number; height: number };
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pet', petId] });
    },
  });
}

export function useDeletePet(petId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deletePet(petId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pets'] });
      queryClient.removeQueries({ queryKey: ['pet', petId] });
    },
  });
}
