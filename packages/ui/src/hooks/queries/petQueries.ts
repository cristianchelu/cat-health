import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteEvent,
  getPetEvents,
  getPets,
  getPetWeightTrends,
  updateEvent,
} from '@/api/pets';
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
    queryFn: () => getPets().then((pets) => pets.find((p) => p.id === petId)),
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
    mutationFn: ({ eventId, data }: { eventId: number; data: any }) =>
      updateEvent(eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['petEvents', petId, currentDateRange],
      });
    },
  });
}

export function usePetWeightTrends(petId: number, days: number) {
  return useQuery({
    queryKey: ['weightTrends', petId, days],
    queryFn: () => getPetWeightTrends(petId, { days }),
  });
}
