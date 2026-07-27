import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/Card';
import { FormShell, Input, Select } from '@/components/ui/form';
import { useDraftForm } from '@/hooks/form';
import {
  useDevices,
  useLinkDeviceCamera,
  useUnlinkDeviceCamera,
  useUpdateDeviceCameraConfig,
} from '@/hooks/queries/deviceQueries';
import type { DeviceCameraConfigDTO, GetDeviceResponseDTO } from 'shared';
import './CameraLinkSection.css';

interface CameraLinkSectionProps {
  device: GetDeviceResponseDTO;
  onDirtyChange?: (dirty: boolean) => void;
}

interface CameraConfigDraft {
  crop: Required<DeviceCameraConfigDTO>['crop'];
  rotate: number | undefined;
  acquisitionTypes: string[];
  fetchDelay: number;
  snapshotIntervalSec: number;
  snapshotFirstFrameDelaySec: number;
}

const DEFAULT_CROP: DeviceCameraConfigDTO['crop'] = {
  left: 0,
  top: 0,
  width: 1,
  height: 1,
};

const VIEWBOX_WIDTH = 100;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normalizeCrop(
  crop?: DeviceCameraConfigDTO['crop'],
): Required<DeviceCameraConfigDTO>['crop'] {
  if (!crop) return DEFAULT_CROP as Required<DeviceCameraConfigDTO>['crop'];
  return {
    left: clamp01(crop.left ?? 0),
    top: clamp01(crop.top ?? 0),
    width: clamp01(crop.width ?? 1),
    height: clamp01(crop.height ?? 1),
  };
}

function ensureCrop(
  crop?: DeviceCameraConfigDTO['crop'],
): Required<DeviceCameraConfigDTO>['crop'] {
  const normalized = normalizeCrop(crop);
  return {
    left: normalized.left,
    top: normalized.top,
    width: normalized.width,
    height: normalized.height,
  };
}

function cameraConfigEqual(
  a: CameraConfigDraft,
  b: CameraConfigDraft,
): boolean {
  return (
    a.rotate === b.rotate &&
    a.fetchDelay === b.fetchDelay &&
    a.snapshotIntervalSec === b.snapshotIntervalSec &&
    a.snapshotFirstFrameDelaySec === b.snapshotFirstFrameDelaySec &&
    a.crop.left === b.crop.left &&
    a.crop.top === b.crop.top &&
    a.crop.width === b.crop.width &&
    a.crop.height === b.crop.height &&
    a.acquisitionTypes.length === b.acquisitionTypes.length &&
    a.acquisitionTypes.every(
      (type, index) => type === b.acquisitionTypes[index],
    )
  );
}

const CameraLinkSection: React.FC<CameraLinkSectionProps> = ({
  device,
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  const { data: allDevices } = useDevices();
  const linkMutation = useLinkDeviceCamera(device.id);
  const unlinkMutation = useUnlinkDeviceCamera(device.id);
  const updateConfigMutation = useUpdateDeviceCameraConfig(device.id);

  const linkedCamera = device.camera_link?.camera_id ?? '';
  const hasIntegratedCamera = device.state?.hasCamera ?? false;

  const [selectedCameraId, setSelectedCameraId] = React.useState<number | ''>(
    linkedCamera,
  );
  const configBaselineKey = JSON.stringify(device.camera_link?.config ?? {});
  const configBaseline = React.useMemo((): CameraConfigDraft => {
    const config = device.camera_link?.config;
    return {
      crop: ensureCrop(config?.crop),
      rotate: config?.rotate,
      acquisitionTypes: config?.acquisitionTypes?.length
        ? [...config.acquisitionTypes]
        : ['snapshot'],
      fetchDelay: config?.fetchDelay ?? 60,
      snapshotIntervalSec: config?.snapshot?.intervalSec ?? 0,
      snapshotFirstFrameDelaySec: config?.snapshot?.firstFrameDelaySec ?? 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baselineKey drives sync
  }, [configBaselineKey]);
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
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = React.useState(false);
  const [snapshotKey, setSnapshotKey] = React.useState(0);
  const [aspectRatio, setAspectRatio] = React.useState(16 / 9);

  const snapshotUrl = React.useMemo(
    () =>
      selectedCameraId
        ? `api/devices/${selectedCameraId}/snapshot?t=${snapshotKey}`
        : undefined,
    [selectedCameraId, snapshotKey],
  );

  React.useEffect(() => {
    setSelectedCameraId(linkedCamera);
  }, [linkedCamera]);

  const cameras = React.useMemo(() => {
    return (allDevices || []).filter(
      (d) => d.type === 'camera' && d.id !== device.id,
    );
  }, [allDevices, device.id]);

  const linkedCameraDevice = React.useMemo(() => {
    if (typeof linkedCamera !== 'number') return undefined;
    return (allDevices || []).find((d) => d.id === linkedCamera);
  }, [allDevices, linkedCamera]);
  const isThinginoCamera =
    linkedCameraDevice?.type === 'camera' &&
    linkedCameraDevice?.provider === 'thingino';

  const buildConfig = (
    source: CameraConfigDraft = configDraft,
  ): DeviceCameraConfigDTO => ({
    crop: source.crop,
    rotate: source.rotate,
    acquisitionTypes: source.acquisitionTypes.length
      ? source.acquisitionTypes
      : ['snapshot'],
    fetchDelay: source.fetchDelay,
    snapshot: source.acquisitionTypes.includes('snapshot')
      ? {
          intervalSec: source.snapshotIntervalSec,
          firstFrameDelaySec: source.snapshotFirstFrameDelaySec,
        }
      : undefined,
  });

  const handleLink = () => {
    if (typeof selectedCameraId !== 'number') return;
    linkMutation.mutate({
      camera_id: selectedCameraId,
      config: buildConfig(configBaseline),
    });
  };

  const handleSaveConfig = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isDirty) return;
    updateConfigMutation.mutate(
      { config: buildConfig() },
      { onSuccess: () => commit() },
    );
  };

  const toggleAcquisitionType = (type: 'snapshot' | 'recording') => {
    setConfigDraft((current) => ({
      ...current,
      acquisitionTypes: current.acquisitionTypes.includes(type)
        ? current.acquisitionTypes.filter((currentType) => currentType !== type)
        : [...current.acquisitionTypes, type].sort(),
    }));
  };

  const handleUnlink = () => {
    unlinkMutation.mutate(undefined, {
      onSuccess: () => {
        setSelectedCameraId('');
        setUnlinkConfirmOpen(false);
      },
    });
  };

  const handleRefreshSnapshot = () => {
    setSnapshotKey((k) => k + 1);
  };

  // ROI interactions
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const getClientCoordinates = (
    ev: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent,
  ) => {
    if ('touches' in ev) {
      return {
        clientX: ev.touches[0].clientX,
        clientY: ev.touches[0].clientY,
      };
    }
    return {
      clientX: (ev as MouseEvent).clientX,
      clientY: (ev as MouseEvent).clientY,
    };
  };

  const getDelta = (
    clientX: number,
    clientY: number,
    startX: number,
    startY: number,
    bounds: DOMRect,
  ) => {
    const screenDx = clientX - startX;
    const screenDy = clientY - startY;
    // Convert screen pixels to normalized units (0-1)
    // bounds.width is the width of the container (image width)
    const dx = screenDx / bounds.width;
    const dy = screenDy / bounds.height;
    return { dx, dy };
  };

  const handleInteractionStart = (
    ev: React.MouseEvent | React.TouchEvent,
    mode: 'move' | 'resize',
    corner?: 'nw' | 'ne' | 'sw' | 'se',
  ) => {
    if (!containerRef.current) return;
    // Prevent scrolling on touch
    if (ev.type === 'touchstart') {
      // ev.preventDefault(); // React synthetic events might not support this directly in all cases, but we'll try to handle it via style touch-action
    }
    ev.stopPropagation();

    const bounds = containerRef.current.getBoundingClientRect();
    const { clientX: startX, clientY: startY } = getClientCoordinates(ev);
    const startCrop = {
      ...configDraft.crop,
    } as Required<DeviceCameraConfigDTO>['crop'];

    const onMove = (moveEv: MouseEvent | TouchEvent) => {
      const { clientX, clientY } = getClientCoordinates(moveEv);
      const { dx, dy } = getDelta(clientX, clientY, startX, startY, bounds);

      if (mode === 'move') {
        const next: Required<DeviceCameraConfigDTO>['crop'] = {
          ...startCrop,
          left: clamp01(startCrop.left + dx),
          top: clamp01(startCrop.top + dy),
        };
        // Ensure we don't go out of bounds (width/height are fixed)
        if (next.left + next.width > 1) next.left = 1 - next.width;
        if (next.top + next.height > 1) next.top = 1 - next.height;
        patchDraft({ crop: next });
      } else if (mode === 'resize' && corner) {
        let newLeft = startCrop.left;
        let newTop = startCrop.top;
        let newRight = startCrop.left + startCrop.width;
        let newBottom = startCrop.top + startCrop.height;

        if (corner.includes('w')) {
          newLeft = Math.min(Math.max(0, startCrop.left + dx), newRight - 0.01);
        } else {
          newRight = Math.max(
            Math.min(1, startCrop.left + startCrop.width + dx),
            newLeft + 0.01,
          );
        }

        if (corner.includes('n')) {
          newTop = Math.min(Math.max(0, startCrop.top + dy), newBottom - 0.01);
        } else {
          newBottom = Math.max(
            Math.min(1, startCrop.top + startCrop.height + dy),
            newTop + 0.01,
          );
        }

        patchDraft({
          crop: {
            left: newLeft,
            top: newTop,
            width: newRight - newLeft,
            height: newBottom - newTop,
          },
        });
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  const renderROI = () => {
    const viewboxHeight = VIEWBOX_WIDTH / aspectRatio;
    const x = configDraft.crop.left * VIEWBOX_WIDTH;
    const y = configDraft.crop.top * viewboxHeight;
    const w = configDraft.crop.width * VIEWBOX_WIDTH;
    const h = configDraft.crop.height * viewboxHeight;

    return (
      <div className="roi-container" ref={containerRef}>
        {snapshotUrl && (
          <img
            src={snapshotUrl}
            className="roi-image"
            alt={t('camera_link.snapshot_alt')}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setAspectRatio(img.naturalWidth / img.naturalHeight);
              }
            }}
          />
        )}
        <svg
          className="roi-svg"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${viewboxHeight}`}
          onTouchStart={(e) => handleInteractionStart(e, 'move')}
        >
          {/* Dimmed overlay */}
          <path
            d={`M 0 0 H ${VIEWBOX_WIDTH} V ${viewboxHeight} H 0 Z M ${x} ${y} h ${w} v ${h} h ${-w} Z`}
            fill="rgba(0, 0, 0, 0.6)"
            fillRule="evenodd"
            style={{ pointerEvents: 'none' }}
          />

          <rect
            className="roi-rect"
            x={x}
            y={y}
            width={w}
            height={h}
            onMouseDown={(e) => handleInteractionStart(e, 'move')}
          />
        </svg>

        {/* HTML Handles */}
        <div
          className="roi-handle nw"
          style={{
            left: `${configDraft.crop.left * 100}%`,
            top: `${configDraft.crop.top * 100}%`,
          }}
          onMouseDown={(e) => handleInteractionStart(e, 'resize', 'nw')}
          onTouchStart={(e) => handleInteractionStart(e, 'resize', 'nw')}
        />
        <div
          className="roi-handle ne"
          style={{
            left: `${(configDraft.crop.left + configDraft.crop.width) * 100}%`,
            top: `${configDraft.crop.top * 100}%`,
          }}
          onMouseDown={(e) => handleInteractionStart(e, 'resize', 'ne')}
          onTouchStart={(e) => handleInteractionStart(e, 'resize', 'ne')}
        />
        <div
          className="roi-handle sw"
          style={{
            left: `${configDraft.crop.left * 100}%`,
            top: `${(configDraft.crop.top + configDraft.crop.height) * 100}%`,
          }}
          onMouseDown={(e) => handleInteractionStart(e, 'resize', 'sw')}
          onTouchStart={(e) => handleInteractionStart(e, 'resize', 'sw')}
        />
        <div
          className="roi-handle se"
          style={{
            left: `${(configDraft.crop.left + configDraft.crop.width) * 100}%`,
            top: `${(configDraft.crop.top + configDraft.crop.height) * 100}%`,
          }}
          onMouseDown={(e) => handleInteractionStart(e, 'resize', 'se')}
          onTouchStart={(e) => handleInteractionStart(e, 'resize', 'se')}
        />
      </div>
    );
  };

  return (
    <Card className="camera-link-section">
      <CardHeader>
        <CardTitle>{t('camera_link.title')}</CardTitle>
        {linkedCamera && (
          <CardAction>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUnlinkConfirmOpen(true)}
              disabled={unlinkMutation.isPending}
            >
              {t('camera_link.unlink')}
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="content">
        <div className="camera-selector">
          <div className="camera-selector-group">
            <label className="label">{t('camera_link.select_camera')}</label>
            <Select
              value={selectedCameraId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedCameraId(value === '' ? '' : Number(value));
              }}
              options={[
                { value: '', label: t('camera_link.no_camera') },
                ...(hasIntegratedCamera
                  ? [
                      {
                        value: String(device.id),
                        label: t('camera_link.integrated_camera'),
                      },
                    ]
                  : []),
                ...cameras.map((cam) => ({
                  value: String(cam.id),
                  label: cam.name,
                })),
              ]}
            />
          </div>
          <Button
            onClick={handleLink}
            disabled={!selectedCameraId || linkMutation.isPending}
          >
            {linkedCamera
              ? t('camera_link.update_link')
              : t('camera_link.link_camera')}
          </Button>
        </div>

        {selectedCameraId && (
          <FormShell
            onSubmit={handleSaveConfig}
            error={
              updateConfigMutation.isError
                ? t('camera_link.save_config_error')
                : null
            }
            actions={{
              onCancel: requestReset,
              cancelLabel: t('common.cancel'),
              submitLabel: t('common.save'),
              isSubmitting: updateConfigMutation.isPending,
              submitDisabled: !isDirty,
            }}
          >
            <div className="roi-section">
              <div className="roi-header">
                <label className="roi-header-label">
                  {t('camera_link.roi_label')}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleRefreshSnapshot}
                >
                  {t('camera_link.refresh_snapshot')}
                </Button>
              </div>

              <div className="roi-wrapper">{renderROI()}</div>
              <div className="roi-instructions">
                {t('camera_link.roi_instructions')}
              </div>

              <div className="rotation-grid">
                <div className="rotation-group">
                  <label className="label">
                    {t('camera_link.rotate_degrees')}
                  </label>
                  <Input
                    type="number"
                    value={configDraft.rotate ?? ''}
                    onChange={(e) =>
                      patchDraft({
                        rotate:
                          e.target.value === ''
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    placeholder="0"
                    min={-180}
                    max={180}
                    disabled={updateConfigMutation.isPending}
                  />
                </div>
              </div>

              <div className="acquisition-section">
                <label className="section-heading">
                  {t('camera_link.acquisition_types')}
                </label>
                <div className="acquisition-checkboxes">
                  <label className="acquisition-option">
                    <input
                      type="checkbox"
                      checked={configDraft.acquisitionTypes.includes(
                        'snapshot',
                      )}
                      onChange={() => toggleAcquisitionType('snapshot')}
                      disabled={updateConfigMutation.isPending}
                    />
                    <span>{t('camera_link.acquisition_snapshot')}</span>
                  </label>
                  <label className="acquisition-option">
                    <input
                      type="checkbox"
                      checked={configDraft.acquisitionTypes.includes(
                        'recording',
                      )}
                      onChange={() => toggleAcquisitionType('recording')}
                      disabled={updateConfigMutation.isPending}
                    />
                    <span>{t('camera_link.acquisition_recording')}</span>
                  </label>
                </div>
                {configDraft.acquisitionTypes.includes('snapshot') && (
                  <div className="snapshot-options-group">
                    <label className="section-heading">
                      {t('camera_link.snapshot_options')}
                    </label>
                    <div className="fetch-delay-group">
                      <label className="label">
                        {t('camera_link.snapshot_interval_label')}
                      </label>
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        value={configDraft.snapshotIntervalSec}
                        onChange={(e) =>
                          patchDraft({
                            snapshotIntervalSec:
                              e.target.value === ''
                                ? 0
                                : Math.max(0, Number(e.target.value)),
                          })
                        }
                        disabled={updateConfigMutation.isPending}
                      />
                      <p className="help-text">
                        {t('camera_link.snapshot_interval_help')}
                      </p>
                    </div>
                    <div className="fetch-delay-group">
                      <label className="label">
                        {t('camera_link.snapshot_first_frame_delay_label')}
                      </label>
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        value={configDraft.snapshotFirstFrameDelaySec}
                        onChange={(e) =>
                          patchDraft({
                            snapshotFirstFrameDelaySec:
                              e.target.value === ''
                                ? 0
                                : Math.max(0, Number(e.target.value)),
                          })
                        }
                        disabled={updateConfigMutation.isPending}
                      />
                      <p className="help-text">
                        {t('camera_link.snapshot_first_frame_delay_help')}
                      </p>
                    </div>
                  </div>
                )}
                <div className="fetch-delay-group">
                  <label className="label">
                    {t('camera_link.fetch_delay_label')}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={configDraft.fetchDelay}
                    onChange={(e) =>
                      patchDraft({
                        fetchDelay:
                          e.target.value === ''
                            ? 0
                            : Math.max(0, Number(e.target.value)),
                      })
                    }
                    disabled={updateConfigMutation.isPending}
                  />
                  <p className="help-text">
                    {t('camera_link.fetch_delay_help')}
                  </p>
                </div>
              </div>

              {isThinginoCamera && linkedCameraDevice && (
                <p className="edit-camera-hint">
                  {t('camera_link.edit_camera_recording_hint')}{' '}
                  <Link
                    to={`/settings/devices/${linkedCameraDevice.id}`}
                    className="edit-camera-link"
                  >
                    {t('camera_link.edit_camera_link')}
                  </Link>
                </p>
              )}
            </div>
          </FormShell>
        )}
      </CardContent>
      <DiscardUnsavedDialog {...discardConfirm} />
      <ConfirmDialog
        open={unlinkConfirmOpen}
        title={t('devices.confirm_unlink_camera_title')}
        description={t('devices.confirm_unlink_camera_description')}
        confirmLabel={t('camera_link.unlink')}
        variant="danger"
        isConfirming={unlinkMutation.isPending}
        onConfirm={handleUnlink}
        onCancel={() => setUnlinkConfirmOpen(false)}
      />
    </Card>
  );
};

export default CameraLinkSection;
