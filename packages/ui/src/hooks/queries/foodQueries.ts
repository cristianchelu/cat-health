import {
  getFoods,
  getFood,
  createFood,
  updateFood,
  deleteFood,
} from '@/api/foods';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  PostFoodRequestDTO,
  PatchFoodRequestDTO,
} from 'shared';

export function useFoods() {
  return useQuery({
    queryKey: ['foods'],
    queryFn: () => getFoods(),
  });
}

export function useFood(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['food', id],
    queryFn: () => getFood(id),
    enabled,
  });
}

export function useCreateFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PostFoodRequestDTO) => createFood(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foods'] });
    },
  });
}

export function useUpdateFood(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PatchFoodRequestDTO) => updateFood(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foods'] });
      queryClient.invalidateQueries({ queryKey: ['food', id] });
    },
  });
}

export function useDeleteFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteFood(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foods'] });
    },
  });
}
