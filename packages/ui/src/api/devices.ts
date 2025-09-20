import type {
  GetEventsResponseDTO,
  GetDeviceResponseDTO,
  GetDevicesResponseDTO,
  PostDeviceRequestDTO,
} from '@cat-health/shared';
import apiClient from './apiClient';

export async function getDevices() {
  const { data } = await apiClient.get<GetDevicesResponseDTO>('/devices');
  return data;
}

export async function getDevice(id: number) {
  const { data } = await apiClient.get<GetDeviceResponseDTO>(`/devices/${id}`);
  return data;
}

export async function addDevice(input: PostDeviceRequestDTO) {
  const { data } = await apiClient.post<GetDeviceResponseDTO>(
    '/devices',
    input,
  );
  return data;
}

export async function getDeviceEvents(
  deviceId: number,
  startTime?: string,
  endTime?: string,
) {
  const params: Record<string, unknown> = { device_id: deviceId };
  if (startTime) {
    params.startTime = startTime;
  }
  if (endTime) {
    params.endTime = endTime;
  }
  const { data } = await apiClient.get<GetEventsResponseDTO>('/events', {
    params,
  });
  return data;
}
