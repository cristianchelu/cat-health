import type { GetSettingsResponseDTO, PatchSettingsRequestDTO } from 'shared';
import apiClient from './apiClient';

export async function getSettings() {
  const { data } = await apiClient.get<GetSettingsResponseDTO>('/settings');
  return data;
}

export async function patchSettings(body: PatchSettingsRequestDTO) {
  const { data } = await apiClient.patch<GetSettingsResponseDTO>(
    '/settings',
    body,
  );
  return data;
}
