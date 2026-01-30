import type {
  GetFoodDTO,
  GetFoodsResponseDTO,
  PostFoodRequestDTO,
  PatchFoodRequestDTO,
  DeleteFoodResponseDTO,
} from 'shared';
import apiClient from './apiClient';

export async function getFoods() {
  const { data } = await apiClient.get<GetFoodsResponseDTO>('/foods');
  return data;
}

export async function getFood(id: number) {
  const { data } = await apiClient.get<GetFoodDTO>(`/foods/${id}`);
  return data;
}

export async function createFood(input: PostFoodRequestDTO) {
  const { data } = await apiClient.post<GetFoodDTO>('/foods', input);
  return data;
}

export async function updateFood(id: number, input: PatchFoodRequestDTO) {
  const { data } = await apiClient.patch<GetFoodDTO>(`/foods/${id}`, input);
  return data;
}

export async function deleteFood(id: number) {
  const { data } = await apiClient.delete<DeleteFoodResponseDTO>(
    `/foods/${id}`,
  );
  return data;
}
