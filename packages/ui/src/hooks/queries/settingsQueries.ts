import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PatchSettingsRequestDTO } from 'shared';
import { getSettings, patchSettings } from '@/api/settings';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchSettingsRequestDTO) => patchSettings(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      for (const trendKey of [
        'weightTrends',
        'waterTrends',
        'foodTrends',
        'litterboxTrends',
      ] as const) {
        queryClient.invalidateQueries({ queryKey: [trendKey] });
      }
    },
  });
}
