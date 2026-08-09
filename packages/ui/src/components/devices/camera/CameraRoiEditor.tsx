import * as React from 'react';
import { RefreshCw, VideoOff } from 'lucide-react';
import { FallbackImage } from '@/components/ui/FallbackImage';
import './CameraMediaSurface.css';
import './CameraRoiEditor.css';

export interface CameraCropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type InteractionCorner = 'nw' | 'ne' | 'sw' | 'se';

interface CameraRoiEditorProps {
  snapshotUrl?: string;
  snapshotAlt: string;
  crop: CameraCropRect;
  onCropChange: (crop: CameraCropRect) => void;
  onRefresh: () => void;
  refreshLabel: string;
  moveLabel: string;
  resizeLabels: Record<InteractionCorner, string>;
  instructions: string;
  disabled?: boolean;
}

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = VIEWBOX_WIDTH / (16 / 9);

const CORNERS: readonly InteractionCorner[] = ['nw', 'ne', 'sw', 'se'];

/** Minimum crop extent on either axis, in frame fractions. */
const MIN_CROP_SIZE = 0.01;

const KEYBOARD_STEP = 0.01;
const KEYBOARD_STEP_LARGE = 0.1;

const ARROW_DELTAS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

function moveCrop(crop: CameraCropRect, dx: number, dy: number) {
  return {
    ...crop,
    left: Math.min(Math.max(0, crop.left + dx), 1 - crop.width),
    top: Math.min(Math.max(0, crop.top + dy), 1 - crop.height),
  };
}

function resizeCrop(
  crop: CameraCropRect,
  corner: InteractionCorner,
  dx: number,
  dy: number,
): CameraCropRect {
  let left = crop.left;
  let top = crop.top;
  let right = crop.left + crop.width;
  let bottom = crop.top + crop.height;

  if (corner.includes('w')) {
    left = Math.min(Math.max(0, left + dx), right - MIN_CROP_SIZE);
  } else {
    right = Math.max(Math.min(1, right + dx), left + MIN_CROP_SIZE);
  }

  if (corner.includes('n')) {
    top = Math.min(Math.max(0, top + dy), bottom - MIN_CROP_SIZE);
  } else {
    bottom = Math.max(Math.min(1, bottom + dy), top + MIN_CROP_SIZE);
  }

  return { left, top, width: right - left, height: bottom - top };
}

interface DragState {
  pointerId: number;
  mode: 'move' | 'resize';
  corner?: InteractionCorner;
  startX: number;
  startY: number;
  startCrop: CameraCropRect;
  bounds: DOMRect;
}

/**
 * Live snapshot preview with a draggable/resizable region-of-interest
 * overlay. Purely presentational: the crop it renders and reports back is
 * always caller-owned state. The frame is locked to 16:9 so overlay math
 * matches the CSS preview box, not the source image's native aspect.
 *
 * Dragging uses pointer capture on the pressed element, so there are no
 * window listeners to leak and an OS-cancelled touch ends the gesture via
 * pointercancel. The move surface and each handle are also keyboard
 * operable with the arrow keys.
 */
const CameraRoiEditor: React.FC<CameraRoiEditorProps> = ({
  snapshotUrl,
  snapshotAlt,
  crop,
  onCropChange,
  onRefresh,
  refreshLabel,
  moveLabel,
  resizeLabels,
  instructions,
  disabled,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const instructionsId = React.useId();

  const startDrag = (
    ev: React.PointerEvent<HTMLElement>,
    mode: 'move' | 'resize',
    corner?: InteractionCorner,
  ) => {
    if (disabled || dragRef.current || !containerRef.current) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragRef.current = {
      pointerId: ev.pointerId,
      mode,
      corner,
      startX: ev.clientX,
      startY: ev.clientY,
      startCrop: { ...crop },
      bounds: containerRef.current.getBoundingClientRect(),
    };
  };

  const handlePointerMove = (ev: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const dx = (ev.clientX - drag.startX) / drag.bounds.width;
    const dy = (ev.clientY - drag.startY) / drag.bounds.height;

    if (drag.mode === 'move') {
      onCropChange(moveCrop(drag.startCrop, dx, dy));
    } else if (drag.corner) {
      onCropChange(resizeCrop(drag.startCrop, drag.corner, dx, dy));
    }
  };

  const endDrag = (ev: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || ev.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    try {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
  };

  const handleKeyAdjust = (
    ev: React.KeyboardEvent<HTMLElement>,
    corner?: InteractionCorner,
  ) => {
    if (disabled) return;
    const delta = ARROW_DELTAS[ev.key];
    if (!delta) return;
    ev.preventDefault();
    const step = ev.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    const dx = delta.dx * step;
    const dy = delta.dy * step;
    onCropChange(
      corner ? resizeCrop(crop, corner, dx, dy) : moveCrop(crop, dx, dy),
    );
  };

  const x = crop.left * VIEWBOX_WIDTH;
  const y = crop.top * VIEWBOX_HEIGHT;
  const w = crop.width * VIEWBOX_WIDTH;
  const h = crop.height * VIEWBOX_HEIGHT;

  return (
    <div className="camera-roi-editor">
      <div className="roi-frame camera-media-surface">
        <div className="roi-media">
          <FallbackImage
            src={snapshotUrl}
            alt={snapshotAlt}
            className="roi-image"
            fallback={
              <VideoOff className="roi-placeholder-icon" aria-hidden="true" />
            }
          />
          <svg
            className="roi-svg"
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            aria-hidden="true"
          >
            <path
              className="roi-mask"
              d={`M 0 0 H ${VIEWBOX_WIDTH} V ${VIEWBOX_HEIGHT} H 0 Z M ${x} ${y} h ${w} v ${h} h ${-w} Z`}
              fillRule="evenodd"
            />
            <rect className="roi-rect" x={x} y={y} width={w} height={h} />
          </svg>
        </div>

        <p id={instructionsId} className="sr-only">
          {instructions}
        </p>

        <div className="roi-container" ref={containerRef}>
          <div
            className="roi-move-surface"
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={moveLabel}
            aria-describedby={instructionsId}
            style={{
              left: `${crop.left * 100}%`,
              top: `${crop.top * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
            }}
            onPointerDown={(e) => startDrag(e, 'move')}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={(e) => handleKeyAdjust(e)}
          />
          {CORNERS.map((corner) => (
            <div
              key={corner}
              className={`roi-handle ${corner}`}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={resizeLabels[corner]}
              aria-describedby={instructionsId}
              style={{
                left: `${(crop.left + (corner.includes('e') ? crop.width : 0)) * 100}%`,
                top: `${(crop.top + (corner.includes('s') ? crop.height : 0)) * 100}%`,
              }}
              onPointerDown={(e) => startDrag(e, 'resize', corner)}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(e) => handleKeyAdjust(e, corner)}
            />
          ))}
        </div>

        <button
          type="button"
          className="roi-refresh-pill"
          onClick={onRefresh}
          disabled={disabled || !snapshotUrl}
        >
          <RefreshCw size={12} aria-hidden="true" />
          {refreshLabel}
        </button>
      </div>
    </div>
  );
};

export { CameraRoiEditor, type CameraRoiEditorProps };
