import type { Pet } from "@/pages/PetList";
import apiClient from "./apiClient";

export async function getPets(): Promise<Pet[]> {
  const { data } = await apiClient.get('/pets');
  return data;
}