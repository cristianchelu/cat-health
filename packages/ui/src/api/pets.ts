import type {
  GetEventsResponseDTO,
  GetEventDTO,
  PostEventRequestDTO,
  DeleteEventResponseDTO,
  PatchEventRequestDTO,
  GetPetsResponseDTO,
  GetPetResponseDTO,
  WeightTrendsResponseDTO,
  WeightTrendQueryDTO,
  WaterTrendsResponseDTO,
  WaterTrendQueryDTO,
  LitterboxTrendsResponseDTO,
  LitterboxTrendQueryDTO,
  PostPetRequestDTO,
  PatchPetRequestDTO,
  DeletePetResponseDTO,
} from 'shared';

import apiClient from './apiClient';

export async function addEvent(input: PostEventRequestDTO) {
  const { data } = await apiClient.post<GetEventDTO>('/events', input);
  return data;
}

export async function getPets() {
  const { data } = await apiClient.get<GetPetsResponseDTO>('/pets');
  return data;
}

export async function getPet(id: number) {
  const { data } = await apiClient.get<GetPetResponseDTO>(`/pets/${id}`);
  return data;
}

export async function createPet(input: PostPetRequestDTO) {
  const { data } = await apiClient.post<GetPetResponseDTO>('/pets', input);
  return data;
}

export async function updatePet(id: number, input: PatchPetRequestDTO) {
  const { data } = await apiClient.patch<GetPetResponseDTO>(
    `/pets/${id}`,
    input,
  );
  return data;
}

export async function deletePet(id: number) {
  const { data } = await apiClient.delete<DeletePetResponseDTO>(`/pets/${id}`);
  return data;
}

export async function getPetEvents(
  petId: number,
  startTime?: string,
  endTime?: string,
  limit?: number,
) {
  const params: Record<string, unknown> = { pet_id: petId };
  if (startTime) {
    params.startTime = startTime;
  }
  if (endTime) {
    params.endTime = endTime;
  }
  if (limit) {
    params.limit = limit;
  }
  const { data } = await apiClient.get<GetEventsResponseDTO>('/events', {
    params,
  });
  return data;
}

export async function deleteEvent(eventId: number) {
  const { data } = await apiClient.delete<DeleteEventResponseDTO>(
    `/events/${eventId}`,
  );
  return data;
}

export async function updateEvent(
  eventId: number,
  input: PatchEventRequestDTO,
) {
  const { data } = await apiClient.patch<GetEventDTO>(
    `/events/${eventId}`,
    input,
  );
  return data;
}

export async function getPetWeightTrends(
  petId: number,
  query: WeightTrendQueryDTO,
) {
  const { data } = await apiClient.get<WeightTrendsResponseDTO>(
    `/events/weight-trends/${petId}`,
    {
      params: query,
    },
  );
  return data;
}

export async function getPetWaterTrends(
  petId: number,
  query: WaterTrendQueryDTO,
) {
  const { data } = await apiClient.get<WaterTrendsResponseDTO>(
    `/events/water-trends/${petId}`,
    {
      params: query,
    },
  );
  return data;
}

export async function getPetLitterboxTrends(
  petId: number,
  query: LitterboxTrendQueryDTO,
) {
  const { data } = await apiClient.get<LitterboxTrendsResponseDTO>(
    `/events/litterbox-trends/${petId}`,
    {
      params: query,
    },
  );
  return data;
}
