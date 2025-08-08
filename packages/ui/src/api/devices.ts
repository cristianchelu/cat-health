import apiClient from "./apiClient";

export type Device = {
  id: number;
  name: string;
  type: "litterbox" | "feeder" | "fountain";
};

export async function getDevices(): Promise<Device[]> {
  const { data } = await apiClient.get('/devices');
  return data;
}

export async function getDevice(id: number): Promise<Device> {
  const { data } = await apiClient.get(`/devices/${id}`);
  return data;
}

export type NewDevice = {
  name: string;
  type: "litterbox" | "feeder" | "fountain";
};

export async function addDevice(input: NewDevice): Promise<Device> {
  const { data } = await apiClient.post('/devices', input);
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

export async function getDeviceEvents(deviceId: number): Promise<Event[]> {
  const { data } = await apiClient.get('/events', { params: { device_id: deviceId } });
  return data;
}