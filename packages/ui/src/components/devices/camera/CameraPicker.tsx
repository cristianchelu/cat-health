import * as React from 'react';
import { Check, VideoOff } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { FallbackImage } from '@/components/ui/FallbackImage';
import './CameraMediaSurface.css';
import './CameraPicker.css';

export interface CameraPickerOption {
  id: number;
  name: string;
  thumbnailUrl?: string;
}

interface CameraPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  cameras: CameraPickerOption[];
  /** Currently drafted camera id; `null` / omitted selects the None tile. */
  selectedCameraId?: number | null;
  onSelect: (cameraId: number | null) => void;
  noneLabel: string;
  emptyLabel: string;
}

/**
 * Camera source picker: thumbnail grid plus a None tile. Selection only
 * reports the choice — the caller owns draft vs persist. The tiles form a
 * single-select group, so they expose radio semantics rather than plain
 * buttons.
 */
const CameraPicker: React.FC<CameraPickerProps> = ({
  open,
  onOpenChange,
  title,
  cameras,
  selectedCameraId,
  onSelect,
  noneLabel,
  emptyLabel,
}) => {
  const noneSelected = selectedCameraId == null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="camera-picker-content" placement="sheet">
        <DialogTitle>{title}</DialogTitle>

        {cameras.length === 0 ? (
          <p className="camera-picker-empty">{emptyLabel}</p>
        ) : (
          <div
            className="camera-picker-grid"
            role="radiogroup"
            aria-label={title}
          >
            <button
              type="button"
              role="radio"
              aria-checked={noneSelected}
              className={`camera-picker-tile ${noneSelected ? 'selected' : ''}`}
              aria-label={noneLabel}
              onClick={() => onSelect(null)}
            >
              <span className="camera-picker-thumb camera-media-surface">
                <VideoOff size={28} aria-hidden="true" />
                {noneSelected && (
                  <span className="camera-picker-selected-indicator">
                    <Check size={12} aria-hidden="true" />
                  </span>
                )}
                <span className="camera-picker-name">{noneLabel}</span>
              </span>
            </button>

            {cameras.map((camera) => (
              <button
                key={camera.id}
                type="button"
                role="radio"
                aria-checked={camera.id === selectedCameraId}
                className={`camera-picker-tile ${
                  camera.id === selectedCameraId ? 'selected' : ''
                }`}
                aria-label={camera.name}
                onClick={() => onSelect(camera.id)}
              >
                <span className="camera-picker-thumb camera-media-surface">
                  <FallbackImage
                    src={camera.thumbnailUrl}
                    alt=""
                    fallbackClassName="camera-picker-thumb-fallback"
                    fallback={<VideoOff size={28} aria-hidden="true" />}
                  />
                  {camera.id === selectedCameraId && (
                    <span className="camera-picker-selected-indicator">
                      <Check size={12} aria-hidden="true" />
                    </span>
                  )}
                  <span className="camera-picker-name">{camera.name}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export { CameraPicker, type CameraPickerProps };
