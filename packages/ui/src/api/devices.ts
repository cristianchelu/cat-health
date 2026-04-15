import type {
  GetEventsResponseDTO,
  GetDeviceResponseDTO,
  GetDevicesResponseDTO,
  PostDeviceRequestDTO,
  PatchDeviceRequestDTO,
  GetProviderAccountsResponseDTO,
  PostProviderAccountRequestDTO,
  PatchProviderAccountRequestDTO,
  ProviderAccountDTO,
  GetDiscoveredDevicesResponseDTO,
  GetProvidersResponseDTO,
  PutDeviceCameraRequestDTO,
  PatchDeviceCameraRequestDTO,
  PostDeviceTestIdentifyRequestDTO,
  PostDeviceTestIdentifyResponseDTO,
} from 'shared';
import apiClient from './apiClient';

export async function getProviders() {
  const { data } =
    await apiClient.get<GetProvidersResponseDTO>('/devices/providers');
  return data;
}

export async function getProviderAccounts() {
  const { data } =
    await apiClient.get<GetProviderAccountsResponseDTO>('/devices/accounts');
  return data;
}

export async function createProviderAccount(
  input: PostProviderAccountRequestDTO,
) {
  const { data } = await apiClient.post<ProviderAccountDTO>(
    '/devices/accounts',
    input,
  );
  return data;
}

export async function getProviderAccount(id: number) {
  const { data } = await apiClient.get<ProviderAccountDTO>(
    `/devices/accounts/${id}`,
  );
  return data;
}

export async function updateProviderAccount(
  id: number,
  input: PatchProviderAccountRequestDTO,
) {
  const { data } = await apiClient.patch<ProviderAccountDTO>(
    `/devices/accounts/${id}`,
    input,
  );
  return data;
}

export async function discoverDevices(accountId: number) {
  const { data } = await apiClient.get<GetDiscoveredDevicesResponseDTO>(
    `/devices/accounts/${accountId}/discover`,
  );
  return data;
}

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

export async function updateDevice(
  deviceId: number,
  input: PatchDeviceRequestDTO,
) {
  const { data } = await apiClient.patch<GetDeviceResponseDTO>(
    `/devices/${deviceId}`,
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

export async function getDeviceAnnotationEvents(
  deviceId: number,
  opts: { limit?: number; offset?: number; human_verified?: boolean } = {},
) {
  const params: Record<string, unknown> = {
    device_id: deviceId,
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
  };
  if (opts.human_verified !== undefined) {
    params.human_verified = opts.human_verified;
  }
  const { data } = await apiClient.get<GetEventsResponseDTO>('/events', {
    params,
  });
  return data;
}

export async function linkDeviceCamera(
  deviceId: number,
  input: PutDeviceCameraRequestDTO,
) {
  const { data } = await apiClient.put<GetDeviceResponseDTO>(
    `/devices/${deviceId}/camera`,
    input,
  );
  return data;
}

export async function updateDeviceCameraConfig(
  deviceId: number,
  input: PatchDeviceCameraRequestDTO,
) {
  const { data } = await apiClient.patch<GetDeviceResponseDTO>(
    `/devices/${deviceId}/camera`,
    input,
  );
  return data;
}

export async function unlinkDeviceCamera(deviceId: number) {
  const { data } = await apiClient.delete<GetDeviceResponseDTO>(
    `/devices/${deviceId}/camera`,
  );
  return data;
}

export async function testDeviceIdentification(
  deviceId: number,
  input: PostDeviceTestIdentifyRequestDTO,
) {
  const { data } = await apiClient.post<PostDeviceTestIdentifyResponseDTO>(
    `/devices/${deviceId}/test-identify`,
    input,
  );
  return data;
}
