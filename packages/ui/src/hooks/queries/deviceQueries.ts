import { getDevice, getDeviceEvents, getDevices } from "@/api/devices";
import { deleteEvent, updateEvent } from "@/api/pets";
import { dateToTimeRange } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: () => getDevices(),
  });
}

export function useDevice(deviceId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["device", deviceId],
    queryFn: () => getDevice(deviceId),
    enabled,
  });
}

export function useDeviceEvents(
  deviceId: number,
  currentDate: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["deviceEvents", deviceId, currentDate],
    queryFn: () => {
      const { startTime, endTime } = dateToTimeRange(currentDate);
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
        queryKey: ["deviceEvents", deviceId, currentDate],
      });
    },
  });
}

export function useUpdateEvent(deviceId: number, currentDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: number; data: any }) =>
      updateEvent(eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["deviceEvents", deviceId, currentDate],
      });
    },
  });
}
