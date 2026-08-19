import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { GetDeviceResponseDTO } from 'shared';
import {
  cameraConfigEqual,
  deviceHasIntegratedCamera,
  draftFromCameraLink,
  hasLinkableCameras,
  listCameraCandidates,
  resolveCameraSaveAction,
  toggleAcquisitionType,
} from '@/lib/cameraConfig';
import {
  CameraTabView,
  type CameraPickerOption,
  type CameraTabViewProps,
} from '@/components/devices/camera';
import { useDraftForm } from '@/hooks/form';
import {
  getProviderBrand,
  providerBrandLabel,
} from '@/pages/settings/provider-wizard/flows/providerBrandRegistry.ts';
import {
  useDevices,
  useLinkDeviceCamera,
  useUnlinkDeviceCamera,
  useUpdateDeviceCameraConfig,
} from '@/hooks/queries/deviceQueries';

const ADD_DEVICE_ROUTE = '/settings/devices/new';

interface CameraTabProps {
  device: GetDeviceResponseDTO;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Wires the Camera tab: linkable roster, draft (source + config), and Save
 * that link / replace / unlink / patch as needed. CameraTabView stays
 * presentational.
 */
const CameraTab: React.FC<CameraTabProps> = ({ device, onDirtyChange }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: allDevices } = useDevices();
  const linkMutation = useLinkDeviceCamera(device.id);
  const unlinkMutation = useUnlinkDeviceCamera(device.id);
  const updateConfigMutation = useUpdateDeviceCameraConfig(device.id);

  const hasIntegratedCamera = deviceHasIntegratedCamera(device);
  const otherCameras = React.useMemo(
    () =>
      listCameraCandidates(allDevices ?? [], {
        deviceId: device.id,
        linkedCameraId: device.camera_link?.camera_id,
      }),
    [allDevices, device.id, device.camera_link?.camera_id],
  );

  const canLinkAnyCamera = hasLinkableCameras({
    cameras: otherCameras,
    hasIntegratedCamera,
  });

  const configBaselineKey = JSON.stringify({
    cameraId: device.camera_link?.camera_id ?? null,
    config: device.camera_link?.config ?? {},
  });
  const configBaseline = React.useMemo(
    () => draftFromCameraLink(device.camera_link),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baselineKey drives sync
    [configBaselineKey],
  );
  const {
    draft: configDraft,
    setDraft: setConfigDraft,
    patchDraft,
    isDirty,
    commit,
    requestReset,
    discardConfirm,
  } = useDraftForm(configBaseline, {
    baselineKey: configBaselineKey,
    isEqual: cameraConfigEqual,
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [snapshotKey, setSnapshotKey] = React.useState(0);

  const draftCameraId = configDraft.cameraId;
  const hasDraftSource = draftCameraId != null;

  const draftCameraDevice = React.useMemo(() => {
    if (draftCameraId == null) return undefined;
    if (draftCameraId === device.id) return device;
    return (allDevices ?? []).find((d) => d.id === draftCameraId);
  }, [allDevices, device, draftCameraId]);

  const snapshotUrl = hasDraftSource
    ? `api/devices/${draftCameraId}/snapshot?t=${snapshotKey}`
    : undefined;

  const cameraOptions: CameraPickerOption[] = React.useMemo(() => {
    const options: CameraPickerOption[] = [];
    if (hasIntegratedCamera) {
      options.push({
        id: device.id,
        name: t('camera_link.integrated_camera'),
        thumbnailUrl: `api/devices/${device.id}/snapshot`,
      });
    }
    for (const camera of otherCameras) {
      options.push({
        id: camera.id,
        name: camera.name,
        thumbnailUrl: `api/devices/${camera.id}/snapshot`,
      });
    }
    return options;
  }, [device.id, hasIntegratedCamera, otherCameras, t]);

  const handleSelectCamera = (cameraId: number | null) => {
    setPickerOpen(false);
    patchDraft({ cameraId });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = resolveCameraSaveAction(configBaseline, configDraft);
    if (action.type === 'none') return;

    if (action.type === 'unlink') {
      unlinkMutation.mutate(undefined, { onSuccess: () => commit() });
      return;
    }

    if (action.type === 'link') {
      linkMutation.mutate(
        { camera_id: action.cameraId, config: action.config },
        { onSuccess: () => commit() },
      );
      return;
    }

    updateConfigMutation.mutate(
      { config: action.config },
      { onSuccess: () => commit() },
    );
  };

  const handleToggleSnapshot = () => {
    setConfigDraft((current) => ({
      ...current,
      acquisitionTypes: toggleAcquisitionType(
        current.acquisitionTypes,
        'snapshot',
      ),
    }));
  };

  const handleToggleRecording = () => {
    setConfigDraft((current) => ({
      ...current,
      acquisitionTypes: toggleAcquisitionType(
        current.acquisitionTypes,
        'recording',
      ),
    }));
  };

  const sourceName = hasDraftSource
    ? draftCameraId === device.id
      ? t('camera_link.integrated_camera')
      : draftCameraDevice?.name
    : undefined;
  const sourceSubtitle =
    hasDraftSource && draftCameraId !== device.id && draftCameraDevice
      ? providerBrandLabel(getProviderBrand(draftCameraDevice.provider), t)
      : undefined;

  const isSaving =
    linkMutation.isPending ||
    unlinkMutation.isPending ||
    updateConfigMutation.isPending;
  const saveFailed =
    linkMutation.isError ||
    unlinkMutation.isError ||
    updateConfigMutation.isError;

  const viewProps: CameraTabViewProps = {
    copy: {
      title: t('camera_link.title'),
      sourceSubtitle: t('camera_link.source_subtitle'),
      changeSource: t('camera_link.change_source'),
      noSourceTitle: t('camera_link.no_source_title'),
      pickerTitle: t('camera_link.picker_title'),
      pickerEmpty: t('camera_link.picker_empty'),
      noneSource: t('camera_link.none_source'),
      snapshotAlt: t('camera_link.snapshot_alt'),
      refreshSnapshot: t('camera_link.refresh_snapshot'),
      roiMoveLabel: t('camera_link.roi_move_label'),
      roiResizeLabels: {
        nw: t('camera_link.roi_resize_nw'),
        ne: t('camera_link.roi_resize_ne'),
        sw: t('camera_link.roi_resize_sw'),
        se: t('camera_link.roi_resize_se'),
      },
      roiInstructions: t('camera_link.roi_instructions'),
      rotateLabel: t('camera_link.rotate_label'),
      captureTitle: t('camera_link.capture_title'),
      captureSubtitle: t('camera_link.capture_subtitle'),
      snapshotLabel: t('camera_link.snapshot_label'),
      snapshotHint: t('camera_link.snapshot_toggle_hint'),
      snapshotIntervalLabel: t('camera_link.snapshot_interval_label'),
      snapshotIntervalHint: t('camera_link.snapshot_interval_help'),
      snapshotFirstFrameDelayLabel: t(
        'camera_link.snapshot_first_frame_delay_label',
      ),
      snapshotFirstFrameDelayHint: t(
        'camera_link.snapshot_first_frame_delay_help',
      ),
      recordingLabel: t('camera_link.recording_label'),
      recordingHint: t('camera_link.recording_toggle_hint'),
      fetchDelayLabel: t('camera_link.fetch_delay_label'),
      fetchDelayHint: t('camera_link.fetch_delay_help'),
      cancelLabel: t('common.cancel'),
      saveLabel: t('camera_link.save_camera'),
      saveError: t('camera_link.save_config_error'),
      emptyTitle: t('devices.no_camera_to_link'),
      emptyDescription: t('camera_link.empty_description'),
      emptyCta: t('settings.add_device'),
    },
    hasLinkableCameras: canLinkAnyCamera,
    onAddDevice: () => navigate(ADD_DEVICE_ROUTE),

    isLinked: hasDraftSource,
    sourceName,
    sourceSubtitle,
    onOpenPicker: () => setPickerOpen(true),

    pickerOpen,
    onPickerOpenChange: setPickerOpen,
    cameraOptions,
    selectedCameraId: draftCameraId,
    onSelectCamera: handleSelectCamera,

    snapshotUrl,
    onRefreshSnapshot: () => setSnapshotKey((k) => k + 1),
    crop: configDraft.crop,
    onCropChange: (crop) => patchDraft({ crop }),

    rotate: configDraft.rotate,
    onRotateChange: (rotate) => patchDraft({ rotate }),

    snapshotEnabled: configDraft.acquisitionTypes.includes('snapshot'),
    onToggleSnapshot: handleToggleSnapshot,
    recordingEnabled: configDraft.acquisitionTypes.includes('recording'),
    onToggleRecording: handleToggleRecording,
    snapshotIntervalSec: configDraft.snapshotIntervalSec,
    onSnapshotIntervalChange: (value) =>
      patchDraft({ snapshotIntervalSec: value }),
    snapshotFirstFrameDelaySec: configDraft.snapshotFirstFrameDelaySec,
    onSnapshotFirstFrameDelayChange: (value) =>
      patchDraft({ snapshotFirstFrameDelaySec: value }),
    fetchDelay: configDraft.fetchDelay,
    onFetchDelayChange: (value) => patchDraft({ fetchDelay: value }),

    onSubmit: handleSubmit,
    onCancel: requestReset,
    isDirty,
    isSaving,
    saveFailed,

    discardConfirm,
    disabled: isSaving,
  };

  return <CameraTabView {...viewProps} />;
};

export default CameraTab;
