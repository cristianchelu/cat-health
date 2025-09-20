import { 
  type GetEventsResponseDTO, 
  type GetEventDTO, 
  type PostEventRequestDTO, 
  type DeleteEventResponseDTO, 
  type PatchEventRequestDTO 
} from "@cat-health/shared";

import apiClient from "./apiClient";

export async function addEvent(input: PostEventRequestDTO) {
  const { data } = await apiClient.post<GetEventDTO>('/events', input);
  return data;
}

export async function getPets() {
  const { data } = await apiClient.get('/pets');
  return data;
}

export async function getPet(id: number) {
  const { data } = await apiClient.get(`/pets/${id}`);
  return data;
}

export async function getPetEvents(petId: number, startTime?: string, endTime?: string, limit?: number){
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
  const { data } = await apiClient.get<GetEventsResponseDTO>('/events', { params });
  return data;
}

export async function deleteEvent(eventId: number) {
  const { data } = await apiClient.delete<DeleteEventResponseDTO>(`/events/${eventId}`);
  return data;
}

export async function updateEvent(eventId: number, input: PatchEventRequestDTO) {
  const { data } = await apiClient.patch<GetEventDTO>(`/events/${eventId}`, input);
  return data;
}

export type WeightTrend = {
  date: string;
  weight: number;
  timestamp: string;
};

export async function getPetWeightTrends(petId: number, days: number = 30) {
  const { data } = await apiClient.get(`/events/weight-trends/${petId}`, { 
    params: { days } 
  });
  return data;
}