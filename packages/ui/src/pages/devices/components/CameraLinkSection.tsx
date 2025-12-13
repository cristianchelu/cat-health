import * as React from 'react';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/Card';
import { Select } from '@/components/ui/form/Select';
import { Input } from '@/components/ui/form/Input';
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
}

const DEFAULT_CROP: DeviceCameraConfigDTO['crop'] = {
  left: 0,
  top: 0,
  width: 1,
  height: 1,
};

const ASPECT_RATIO = 16 / 9;
const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = VIEWBOX_WIDTH / ASPECT_RATIO;

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

const CameraLinkSection: React.FC<CameraLinkSectionProps> = ({ device }) => {
  const { data: allDevices } = useDevices();
  const linkMutation = useLinkDeviceCamera(device.id);
  const unlinkMutation = useUnlinkDeviceCamera(device.id);
  const updateConfigMutation = useUpdateDeviceCameraConfig(device.id);

  const linkedCamera = device.camera_link?.camera_id ?? '';
  const normalizedCrop = React.useMemo(
    () => ensureCrop(device.camera_link?.config?.crop),
    [
      device.camera_link?.config?.crop?.left,
      device.camera_link?.config?.crop?.top,
      device.camera_link?.config?.crop?.width,
      device.camera_link?.config?.crop?.height,
    ],
  );
  const normalizedRotate = device.camera_link?.config?.rotate;

  const [selectedCameraId, setSelectedCameraId] = React.useState<number | ''>(
    linkedCamera,
  );
  const [crop, setCrop] =
    React.useState<Required<DeviceCameraConfigDTO>['crop']>(normalizedCrop);
  const [rotate, setRotate] = React.useState<number | undefined>(
    normalizedRotate,
  );
  const [snapshotKey, setSnapshotKey] = React.useState(0);

  React.useEffect(() => {
    setSelectedCameraId(linkedCamera);
  }, [linkedCamera]);

  React.useEffect(() => {
    setCrop(normalizedCrop);
  }, [normalizedCrop]);

  React.useEffect(() => {
    setRotate(normalizedRotate);
  }, [normalizedRotate]);

  const cameras = React.useMemo(() => {
    return (allDevices || []).filter(
      (d) => d.type === 'camera' && d.id !== device.id,
    );
  }, [allDevices, device.id]);

  const handleLink = () => {
    if (!selectedCameraId || typeof selectedCameraId !== 'number') return;
    const config: DeviceCameraConfigDTO = { crop, rotate };
    linkMutation.mutate({ camera_id: selectedCameraId, config });
  };

  const handleSaveROI = () => {
    const config: DeviceCameraConfigDTO = { crop, rotate };
    updateConfigMutation.mutate({ config });
  };

  const handleUnlink = () => {
    unlinkMutation.mutate();
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
    const startCrop = { ...crop } as Required<DeviceCameraConfigDTO>['crop'];

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
        setCrop(next);
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

        setCrop({
          left: newLeft,
          top: newTop,
          width: newRight - newLeft,
          height: newBottom - newTop,
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
    const x = crop.left * VIEWBOX_WIDTH;
    const y = crop.top * VIEWBOX_HEIGHT;
    const w = crop.width * VIEWBOX_WIDTH;
    const h = crop.height * VIEWBOX_HEIGHT;

    const snapshotUrl = selectedCameraId
      ? `/api/devices/${selectedCameraId}/snapshot?t=${snapshotKey}`
      : undefined;

    return (
      <div className="roi-container" ref={containerRef}>
        <svg
          className="roi-svg"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          style={{ aspectRatio: '16/9' }}
          onTouchStart={(e) => handleInteractionStart(e, 'move')}
        >
          {snapshotUrl && (
            <image
              href={snapshotUrl}
              x="0"
              y="0"
              width={VIEWBOX_WIDTH}
              height={VIEWBOX_HEIGHT}
              preserveAspectRatio="none"
            />
          )}

          {/* Dimmed overlay */}
          <path
            d={`M 0 0 H ${VIEWBOX_WIDTH} V ${VIEWBOX_HEIGHT} H 0 Z M ${x} ${y} h ${w} v ${h} h ${-w} Z`}
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
          style={{ left: `${crop.left * 100}%`, top: `${crop.top * 100}%` }}
          onMouseDown={(e) => handleInteractionStart(e, 'resize', 'nw')}
          onTouchStart={(e) => handleInteractionStart(e, 'resize', 'nw')}
        />
        <div
          className="roi-handle ne"
          style={{
            left: `${(crop.left + crop.width) * 100}%`,
            top: `${crop.top * 100}%`,
          }}
          onMouseDown={(e) => handleInteractionStart(e, 'resize', 'ne')}
          onTouchStart={(e) => handleInteractionStart(e, 'resize', 'ne')}
        />
        <div
          className="roi-handle sw"
          style={{
            left: `${crop.left * 100}%`,
            top: `${(crop.top + crop.height) * 100}%`,
          }}
          onMouseDown={(e) => handleInteractionStart(e, 'resize', 'sw')}
          onTouchStart={(e) => handleInteractionStart(e, 'resize', 'sw')}
        />
        <div
          className="roi-handle se"
          style={{
            left: `${(crop.left + crop.width) * 100}%`,
            top: `${(crop.top + crop.height) * 100}%`,
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
        <CardTitle>Camera Linking</CardTitle>
        {linkedCamera && (
          <CardAction>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleUnlink}
              disabled={unlinkMutation.isPending}
            >
              Unlink
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="content">
        <div className="camera-selector">
          <div className="camera-selector-group">
            <label className="label">Select camera</label>
            <Select
              value={selectedCameraId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedCameraId(value === '' ? '' : Number(value));
              }}
              options={[
                { value: '', label: 'No camera linked' },
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
            {linkedCamera ? 'Update link' : 'Link camera'}
          </Button>
        </div>

        {selectedCameraId && (
          <div className="roi-section">
            <div className="roi-header">
              <label className="roi-header-label">
                Region of Interest (ROI)
              </label>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRefreshSnapshot}
              >
                Refresh Snapshot
              </Button>
            </div>

            <div className="roi-wrapper">{renderROI()}</div>
            <div className="roi-instructions">
              Drag the rectangle to move. Drag the corner handles to resize.
            </div>

            <div className="rotation-grid">
              <div className="rotation-group">
                <label className="label">Rotate (degrees)</label>
                <Input
                  type="number"
                  value={rotate ?? ''}
                  onChange={(e) =>
                    setRotate(
                      e.target.value === ''
                        ? undefined
                        : Number(e.target.value),
                    )
                  }
                  placeholder="0"
                  min={-180}
                  max={180}
                />
              </div>
              <div className="rotation-button-group">
                <Button
                  className="rotation-button"
                  variant="primary"
                  onClick={handleSaveROI}
                  disabled={!linkedCamera || updateConfigMutation.isPending}
                >
                  Save ROI & Rotation
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CameraLinkSection;
