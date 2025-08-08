export type AddEventInput = {
  pet_id: number;
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

export async function getPetEvents(petId: number): Promise<Event[]> {
  const { data } = await apiClient.get(`/events/${petId}`);
  return data;
}

export async function deleteEvent(eventId: number): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete(`/events/${eventId}`);
  return data;
}

export type UpdateEventInput = {
  data?: Record<string, unknown>;
  human_verified?: boolean;
};

export async function updateEvent(eventId: number, input: UpdateEventInput): Promise<Event> {
  const { data } = await apiClient.patch(`/events/${eventId}`, input);
  return data;
}