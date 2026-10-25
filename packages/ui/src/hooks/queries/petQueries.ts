import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';

import {
  deleteEvent,
  getPetEvents,
  getRecentPetEventsByType,
  getPets,
  getPetWeightTrends,
  getPetWaterTrends,
  getPetFoodTrends,
  getPetLitterboxTrends,
  updateEvent,
  getPet,
  createPet,
  updatePet,
  deletePet,
  setPetPresence,
  closePetProfile,
  reopenPetProfile,
  uploadPetAvatar,
  deletePetAvatar,
} from '@/api/pets';
import type {
  PostPetRequestDTO,
  PatchPetRequestDTO,
  PatchEventRequestDTO,
  LitterboxTrendQueryDTO,
  PutPetPresenceRequestDTO,
  GetPetResponseDTO,
} from 'shared';
import { dateRangeToTimeRange, type DateRange } from '@/lib/utils';
import { useRegionalPreferences } from '@/hooks/context/useRegionalPreferences';

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
  const { timezone } = useRegionalPreferences();
  return useQuery({
    queryKey: ['petEvents', petId, currentDateRange, timezone],
    queryFn: () => {
      const { startTime, endTime } = dateRangeToTimeRange(
        currentDateRange,
        timezone,
      );
      return getPetEvents(petId, startTime, endTime, 5000);
    },
    enabled,
    // Keep prior day while the range changes, but never flash another pet's events.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === petId ? previousData : undefined,
  });
}

/**
 * The window the log flow reads "recent" and "usual" out of. Wide enough that
 * a household rotating a handful of foods still shows three distinct ones,
 * short enough to stay a cheap fetch.
 */
const RECENT_FOOD_INTAKE_LIMIT = 30;

export function useRecentFoodIntakes(petId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['recentFoodIntakes', petId],
    queryFn: () =>
      getRecentPetEventsByType(petId, 'food_intake', RECENT_FOOD_INTAKE_LIMIT),
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
  const { timezone } = useRegionalPreferences();
  return useQuery({
    queryKey: ['weightTrends', petId, days, timezone],
    queryFn: () => getPetWeightTrends(petId, { days, timezone }),
    enabled: petId > 0,
  });
}

export function usePetWaterTrends(petId: number, days: number) {
  const { timezone } = useRegionalPreferences();
  return useQuery({
    queryKey: ['waterTrends', petId, days, timezone],
    queryFn: () => getPetWaterTrends(petId, { days, timezone }),
    enabled: petId > 0,
  });
}

export function usePetFoodTrends(petId: number, days: number) {
  const { timezone } = useRegionalPreferences();
  return useQuery({
    queryKey: ['foodTrends', petId, days, timezone],
    queryFn: () => getPetFoodTrends(petId, { days, timezone }),
    enabled: petId > 0,
  });
}

export function usePetLitterboxTrends(
  petId: number,
  query: Omit<LitterboxTrendQueryDTO, 'timezone'>,
  enabled = true,
) {
  const { timezone } = useRegionalPreferences();
  const requestQuery = { ...query, timezone };
  return useQuery({
    queryKey: ['litterboxTrends', petId, requestQuery],
    queryFn: () => getPetLitterboxTrends(petId, requestQuery),
    enabled,
    placeholderData: keepPreviousData,
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

export function useUploadPetAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ petId, file }: { petId: number; file: File }) =>
      uploadPetAvatar(petId, file),
    onSuccess: (_result, { petId }) => {
      queryClient.invalidateQueries({ queryKey: ['pets'] });
      queryClient.invalidateQueries({ queryKey: ['pet', petId] });
    },
  });
}

export function useDeletePetAvatar(petId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deletePetAvatar(petId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pets'] });
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

const TREND_KEYS = [
  'weightTrends',
  'waterTrends',
  'foodTrends',
  'litterboxTrends',
];

/** A presence change opens or closes an untracked interval in that pet's trends. */
function invalidatePetHistory(
  queryClient: ReturnType<typeof useQueryClient>,
  petId: number,
) {
  queryClient.invalidateQueries({ queryKey: ['pets'] });
  queryClient.invalidateQueries({ queryKey: ['pet', petId] });
  queryClient.invalidateQueries({ queryKey: ['petEvents', petId] });
  for (const trendKey of TREND_KEYS) {
    queryClient.invalidateQueries({ queryKey: [trendKey, petId] });
  }
}

export function useSetPetPresence(petId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PutPetPresenceRequestDTO) =>
      setPetPresence(petId, input),
    onSuccess: () => invalidatePetHistory(queryClient, petId),
  });
}

/**
 * Closing or reopening also adds or removes the pet's events from every shared
 * timeline, so those lists refetch along with the pet's own history.
 */
function useProfileLifecycle(
  petId: number,
  action: (id: number) => Promise<GetPetResponseDTO>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => action(petId),
    onSuccess: (pet) => {
      queryClient.setQueryData(['pet', petId], pet);
      invalidatePetHistory(queryClient, petId);
      for (const listKey of [
        'events',
        'deviceEvents',
        'deviceAnnotationEvents',
      ]) {
        queryClient.invalidateQueries({ queryKey: [listKey] });
      }
    },
  });
}

export function useCloseProfile(petId: number) {
  return useProfileLifecycle(petId, closePetProfile);
}

export function useReopenProfile(petId: number) {
  return useProfileLifecycle(petId, reopenPetProfile);
}
