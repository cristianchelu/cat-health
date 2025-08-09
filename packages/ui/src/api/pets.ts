export type AddEventInput = {
  pet_id?: number | null;
  device_id?: number | null;
  timestamp?: string;
  data: Record<string, unknown>;
};

export async function addEvent(input: AddEventInput): Promise<Event> {
  const { data } = await apiClient.post('/events', input);
  return data;
}
import type { Pet } from "@/pages/PetList";
import apiClient from "./apiClient";

export async function getPets(): Promise<Pet[]> {
  const { data } = await apiClient.get('/pets');
  return data;
}

export async function getPet(id: number): Promise<Pet> {
  const { data } = await apiClient.get(`/pets/${id}`);
  return data;
}

export type Event = {
  id: number;
  pet_id: number;
  device_id: number | null;
  timestamp: string;
  data: Record<string, unknown>;
  raw_data: number[] | null;
  human_verified: boolean;
};

export type PaginatedEvents = {
  events: Event[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export async function getPetEvents(petId: number, startTime?: string, endTime?: string): Promise<PaginatedEvents> {
  const params: Record<string, unknown> = { pet_id: petId };
  if (startTime) {
    params.startTime = startTime;
  }
  if (endTime) {
    params.endTime = endTime;
  }
  const { data } = await apiClient.get('/events', { params });
  return data;
}

export async function deleteEvent(eventId: number): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete(`/events/${eventId}`);
  return data;
}

export type UpdateEventInput = {
  pet_id?: number | null;
  data?: Record<string, unknown>;
  human_verified?: boolean;
};

export async function updateEvent(eventId: number, input: UpdateEventInput): Promise<Event> {
  const { data } = await apiClient.patch(`/events/${eventId}`, input);
  return data;
}