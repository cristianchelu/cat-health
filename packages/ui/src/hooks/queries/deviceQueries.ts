import {
  getDevice,
  getDeviceEvents,
  getDevices,
  getProviders,
  getProviderAccounts,
  createProviderAccount,
  discoverDevices,
  addDevice,
} from '@/api/devices';
import { deleteEvent, updateEvent } from '@/api/pets';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PatchEventRequestDTO,
  PostProviderAccountRequestDTO,
  PostDeviceRequestDTO,
} from 'shared';

export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: () => getDevices(),
  });
}

export function useDevice(deviceId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => getDevice(deviceId),
    enabled,
  });
}

export function useDeviceEvents(
  deviceId: number,
  startTime: string,
  endTime: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['deviceEvents', deviceId, startTime, endTime],
    queryFn: () => {
      return getDeviceEvents(deviceId, startTime, endTime);
    },
    enabled,
  });
}

export function useDeleteEvent(deviceId: number, currentDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: number) => deleteEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['deviceEvents', deviceId, currentDate],
      });
    },
  });
}

export function useUpdateEvent(deviceId: number, currentDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      data,
    }: {
      eventId: number;
      data: PatchEventRequestDTO;
    }) => updateEvent(eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['deviceEvents', deviceId, currentDate],
      });
    },
  });
}

// --- Providers ---

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => getProviders(),
  });
}

export function useProviderAccounts() {
  return useQuery({
    queryKey: ['providerAccounts'],
    queryFn: () => getProviderAccounts(),
  });
}

export function useCreateProviderAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PostProviderAccountRequestDTO) =>
      createProviderAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providerAccounts'] });
    },
  });
}

export function useDiscoverDevices(accountId: number | null) {
  return useQuery({
    queryKey: ['discoveredDevices', accountId],
    queryFn: () =>
      accountId ? discoverDevices(accountId) : Promise.resolve([]),
    enabled: !!accountId,
  });
}

export function useAddDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PostDeviceRequestDTO) => addDevice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}
