import {
  getDevice,
  getDeviceEvents,
  getDeviceAnnotationEvents,
  getDevices,
  getDevicePreviews,
  getProviders,
  getProviderAccounts,
  getProviderAccount,
  createProviderAccount,
  updateProviderAccount,
  discoverDevices,
  getRemotePets,
  addDevice,
  updateDevice,
  linkDeviceCamera,
  updateDeviceCameraConfig,
  unlinkDeviceCamera,
  linkDeviceRecognition,
  updateDeviceRecognitionConfig,
  unlinkDeviceRecognition,
} from '@/api/devices';
import { deleteEvent, updateEvent } from '@/api/pets';
import * as React from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import type {
  PatchEventRequestDTO,
  PostProviderAccountRequestDTO,
  PatchProviderAccountRequestDTO,
  PostDeviceRequestDTO,
  PatchDeviceRequestDTO,
  PutDeviceCameraRequestDTO,
  PutDeviceRecognitionRequestDTO,
  PatchDeviceRecognitionRequestDTO,
  PatchDeviceCameraRequestDTO,
  GetEventsResponseDTO,
} from 'shared';

export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: () => getDevices(),
  });
}

/**
 * Layout + atlas URL for device-card sprites. Polling the layout does not
 * start camera fetches — the idle poller already does that.
 *
 * The CSS background is swapped only after the next atlas has decoded, so
 * a generation bump does not flash empty tiles for a few frames.
 */
export function useCameraPreviewAtlas(enabled: boolean) {
  const { data: layout } = useQuery({
    queryKey: ['devicePreviews'],
    queryFn: getDevicePreviews,
    enabled,
    refetchInterval: 1000,
    placeholderData: keepPreviousData,
  });

  const [sheet, setSheet] = React.useState<PreviewAtlasSheet | undefined>();
  const sheetRef = React.useRef(sheet);
  sheetRef.current = sheet;
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;

  React.useEffect(() => {
    const nextLayout = layoutRef.current;
    if (!enabled || !nextLayout) return;
    if (nextLayout.devices.length === 0) {
      sheetRef.current = undefined;
      setSheet(undefined);
      return;
    }
    if (sheetRef.current?.generation === nextLayout.generation) return;

    const atlasUrl = previewAtlasUrl(nextLayout.generation);
    let cancelled = false;
    void decodePreviewAtlas(atlasUrl).then(
      () => {
        if (cancelled) return;
        const next: PreviewAtlasSheet = {
          generation: nextLayout.generation,
          atlasUrl,
          width: nextLayout.width,
          height: nextLayout.height,
          cell_size: nextLayout.cell_size,
          devices: nextLayout.devices,
        };
        sheetRef.current = next;
        setSheet(next);
      },
      () => {
        /* Keep the last good sheet; a failed fetch must not blank the tiles. */
      },
    );

    return () => {
      cancelled = true;
    };
  }, [enabled, layout?.generation]);

  const cells = React.useMemo(() => {
    const map = new Map<number, { x: number; y: number }>();
    for (const cell of sheet?.devices ?? []) {
      map.set(cell.id, { x: cell.x, y: cell.y });
    }
    return map;
  }, [sheet]);

  return {
    layout: sheet,
    cells,
    atlasUrl: sheet?.atlasUrl,
  };
}

type PreviewAtlasSheet = {
  generation: number;
  atlasUrl: string;
  width: number;
  height: number;
  cell_size: number;
  devices: { id: number; x: number; y: number }[];
};

function previewAtlasUrl(generation: number): string {
  return `api/devices/previews/atlas?g=${generation}`;
}

function decodePreviewAtlas(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  if (typeof img.decode === 'function') {
    return img.decode().then(() => undefined);
  }
  return new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load preview atlas'));
  });
}

export type UseDeviceOptions = {
  /** Set to false to disable polling (e.g. on edit form). Default 1000ms for live overview. */
  refetchInterval?: number | false;
};

export function useDevice(
  deviceId: number,
  enabled: boolean,
  options?: UseDeviceOptions,
) {
  return useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => getDevice(deviceId),
    enabled,
    refetchInterval:
      options?.refetchInterval === false
        ? false
        : (options?.refetchInterval ?? 1000),
  });
}

export function useDeviceEvents(
  deviceId: number,
  startTime: string,
  endTime: string,
  enabled: boolean,
) {
  return useQuery<GetEventsResponseDTO>({
    queryKey: ['deviceEvents', deviceId, startTime, endTime],
    queryFn: () => {
      return getDeviceEvents(deviceId, startTime, endTime);
    },
    enabled,
    placeholderData: keepPreviousData,
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

export function useDeviceAnnotationEvents(
  deviceId: number,
  opts: { limit?: number; offset?: number; human_verified?: boolean } = {},
) {
  return useQuery({
    queryKey: ['deviceAnnotationEvents', deviceId, opts],
    queryFn: () => getDeviceAnnotationEvents(deviceId, opts),
    placeholderData: keepPreviousData,
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

export function useProviderAccount(accountId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['providerAccount', accountId],
    queryFn: () => getProviderAccount(accountId),
    enabled,
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

export function useUpdateProviderAccount(accountId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PatchProviderAccountRequestDTO) =>
      updateProviderAccount(accountId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providerAccounts'] });
      queryClient.invalidateQueries({
        queryKey: ['providerAccount', accountId],
      });
      // Device rows mirror `account_enabled`, which decides whether they appear
      // on the roster, so they go stale the moment the account is patched.
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

export function useRemotePets(accountId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['remotePets', accountId],
    queryFn: () => getRemotePets(accountId),
    enabled: enabled && accountId > 0,
  });
}

export function useDiscoverDevices(
  accountId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['discoveredDevices', accountId],
    queryFn: () =>
      accountId ? discoverDevices(accountId) : Promise.resolve([]),
    enabled: !!accountId && options?.enabled !== false,
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

export function useUpdateDevice(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PatchDeviceRequestDTO) => updateDevice(deviceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

export function useLinkDeviceCamera(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PutDeviceCameraRequestDTO) =>
      linkDeviceCamera(deviceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

export function useUpdateDeviceCameraConfig(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PatchDeviceCameraRequestDTO) =>
      updateDeviceCameraConfig(deviceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

export function useLinkDeviceRecognition(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PutDeviceRecognitionRequestDTO) =>
      linkDeviceRecognition(deviceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

export function useUpdateDeviceRecognitionConfig(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PatchDeviceRecognitionRequestDTO) =>
      updateDeviceRecognitionConfig(deviceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

export function useUnlinkDeviceRecognition(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unlinkDeviceRecognition(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

export function useUnlinkDeviceCamera(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unlinkDeviceCamera(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}
