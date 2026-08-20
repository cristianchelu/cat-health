import * as React from 'react';
import { Cog, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ControlGroup } from '@/components/ui/ControlGroup';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { EmptyState } from '@/components/ui/PageState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FormShell } from '@/components/ui/form';
import { CAMERA_ROTATION_OPTIONS } from '@/lib/cameraConfig';
import { CameraCaptureFields } from './CameraCaptureFields';
import { CameraPicker, type CameraPickerOption } from './CameraPicker';
import { CameraRoiEditor, type CameraCropRect } from './CameraRoiEditor';
import { DeviceModelRow } from './DeviceModelRow';
import './CameraTabView.css';

/**
 * Frame with a marked top edge. Rotating the glyph shows which way the image
 * will face — clearer for non-technical users than a rotated camera body.
 */
function CameraOrientationIcon({
  degrees,
  size = 16,
}: {
  degrees: number;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="camera-orientation-icon"
      style={{ transform: `rotate(${degrees}deg)` }}
    >
      <rect
        x="3.25"
        y="2.25"
        width="9.5"
        height="11.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5.5 5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface CameraTabViewCopy {
  title: string;
  sourceSubtitle: string;
  changeSource: string;
  noSourceTitle: string;
  pickerTitle: string;
  pickerEmpty: string;
  noneSource: string;
  snapshotAlt: string;
  refreshSnapshot: string;
  roiMoveLabel: string;
  roiResizeLabels: {
    nw: string;
    ne: string;
    sw: string;
    se: string;
  };
  roiInstructions: string;
  rotateLabel: string;
  captureTitle: string;
  captureSubtitle: string;
  snapshotLabel: string;
  snapshotHint: string;
  snapshotIntervalLabel: string;
  snapshotIntervalHint: string;
  snapshotFirstFrameDelayLabel: string;
  snapshotFirstFrameDelayHint: string;
  recordingLabel: string;
  recordingHint: string;
  fetchDelayLabel: string;
  fetchDelayHint: string;
  cancelLabel: string;
  saveLabel: string;
  saveError: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyCta: string;
}

interface CameraTabViewProps {
  copy: CameraTabViewCopy;
  hasLinkableCameras: boolean;
  onAddDevice: () => void;

  /** Draft currently has a camera source selected. */
  isLinked: boolean;
  sourceName?: string;
  sourceSubtitle?: string;
  onOpenPicker: () => void;

  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  cameraOptions: CameraPickerOption[];
  selectedCameraId?: number | null;
  onSelectCamera: (cameraId: number | null) => void;

  snapshotUrl?: string;
  onRefreshSnapshot: () => void;
  crop: CameraCropRect;
  onCropChange: (crop: CameraCropRect) => void;

  rotate: number | undefined;
  onRotateChange: (rotate: number) => void;

  snapshotEnabled: boolean;
  onToggleSnapshot: (checked: boolean) => void;
  recordingEnabled: boolean;
  onToggleRecording: (checked: boolean) => void;
  snapshotIntervalSec: number;
  onSnapshotIntervalChange: (value: number) => void;
  snapshotFirstFrameDelaySec: number;
  onSnapshotFirstFrameDelayChange: (value: number) => void;
  fetchDelay: number;
  onFetchDelayChange: (value: number) => void;

  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isDirty: boolean;
  isSaving: boolean;
  saveFailed: boolean;

  discardConfirm: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  };

  disabled?: boolean;
}

/**
 * Pure presentation for the device details Camera tab. Source selection and
 * framing/capture settings are all draft-driven; the container owns Save.
 */
const CameraTabView: React.FC<CameraTabViewProps> = ({
  copy,
  hasLinkableCameras,
  onAddDevice,
  isLinked,
  sourceName,
  sourceSubtitle,
  onOpenPicker,
  pickerOpen,
  onPickerOpenChange,
  cameraOptions,
  selectedCameraId,
  onSelectCamera,
  snapshotUrl,
  onRefreshSnapshot,
  crop,
  onCropChange,
  rotate,
  onRotateChange,
  snapshotEnabled,
  onToggleSnapshot,
  recordingEnabled,
  onToggleRecording,
  snapshotIntervalSec,
  onSnapshotIntervalChange,
  snapshotFirstFrameDelaySec,
  onSnapshotFirstFrameDelayChange,
  fetchDelay,
  onFetchDelayChange,
  onSubmit,
  onCancel,
  isDirty,
  isSaving,
  saveFailed,
  discardConfirm,
  disabled,
}) => {
  const rotationLabelId = React.useId();

  // Stay on the form when the user cleared the only source but has not Saved
  // yet — otherwise Save/Cancel would disappear into the empty state.
  if (!hasLinkableCameras && !isLinked && !isDirty) {
    return (
      <div className="camera-tab-view">
        <Card>
          <CardContent>
            <EmptyState className="camera-empty-state">
              <span className="camera-empty-icon">
                <Video size={20} aria-hidden="true" />
              </span>
              <p className="camera-empty-title">{copy.emptyTitle}</p>
              <p className="camera-empty-description">
                {copy.emptyDescription}
              </p>
              <Button onClick={onAddDevice}>{copy.emptyCta}</Button>
            </EmptyState>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sourceRow = isLinked ? (
    <DeviceModelRow
      title={sourceName}
      subtitle={sourceSubtitle}
      action={
        <Button variant="secondary" size="sm" onClick={onOpenPicker}>
          {copy.changeSource}
        </Button>
      }
    />
  ) : (
    <DeviceModelRow
      title={copy.noSourceTitle}
      action={
        <Button variant="secondary" size="sm" onClick={onOpenPicker}>
          {copy.changeSource}
        </Button>
      }
    />
  );

  const cameraHeader = (
    <SectionHeader
      size="compact"
      className="first"
      icon={<Video aria-hidden="true" />}
      subtitle={copy.sourceSubtitle}
    >
      {copy.title}
    </SectionHeader>
  );

  return (
    <div className="camera-tab-view">
      <FormShell
        className="camera-tab-form"
        onSubmit={onSubmit}
        error={saveFailed ? copy.saveError : null}
        actions={{
          onCancel,
          cancelLabel: copy.cancelLabel,
          submitLabel: copy.saveLabel,
          isSubmitting: isSaving,
          submitDisabled: !isDirty,
        }}
      >
        {cameraHeader}
        <Card className="camera-tab-card">
          <CardContent>
            <div className="camera-card-stack">
              {sourceRow}
              {isLinked && (
                <>
                  <CameraRoiEditor
                    snapshotUrl={snapshotUrl}
                    snapshotAlt={copy.snapshotAlt}
                    crop={crop}
                    onCropChange={onCropChange}
                    onRefresh={onRefreshSnapshot}
                    refreshLabel={copy.refreshSnapshot}
                    moveLabel={copy.roiMoveLabel}
                    resizeLabels={copy.roiResizeLabels}
                    instructions={copy.roiInstructions}
                    disabled={disabled}
                  />

                  <div className="camera-rotation-field">
                    <span
                      id={rotationLabelId}
                      className="camera-rotation-field-label"
                    >
                      {copy.rotateLabel}
                    </span>
                    <ControlGroup
                      className="camera-rotation-options"
                      role="group"
                      aria-labelledby={rotationLabelId}
                    >
                      {CAMERA_ROTATION_OPTIONS.map((degrees) => {
                        const active = (rotate ?? 0) === degrees;
                        return (
                          <Button
                            key={degrees}
                            type="button"
                            variant={active ? 'outline' : 'neutral'}
                            size="sm"
                            aria-pressed={active}
                            onClick={() => onRotateChange(degrees)}
                            disabled={disabled}
                          >
                            <CameraOrientationIcon degrees={degrees} />
                            <span>{degrees}°</span>
                          </Button>
                        );
                      })}
                    </ControlGroup>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {isLinked && (
          <>
            <SectionHeader
              size="compact"
              icon={<Cog aria-hidden="true" />}
              subtitle={copy.captureSubtitle}
            >
              {copy.captureTitle}
            </SectionHeader>
            <Card className="camera-tab-card">
              <CardContent>
                <CameraCaptureFields
                  snapshotEnabled={snapshotEnabled}
                  onToggleSnapshot={onToggleSnapshot}
                  snapshotLabel={copy.snapshotLabel}
                  snapshotHint={copy.snapshotHint}
                  snapshotIntervalSec={snapshotIntervalSec}
                  onSnapshotIntervalChange={onSnapshotIntervalChange}
                  snapshotIntervalLabel={copy.snapshotIntervalLabel}
                  snapshotIntervalHint={copy.snapshotIntervalHint}
                  snapshotFirstFrameDelaySec={snapshotFirstFrameDelaySec}
                  onSnapshotFirstFrameDelayChange={
                    onSnapshotFirstFrameDelayChange
                  }
                  snapshotFirstFrameDelayLabel={
                    copy.snapshotFirstFrameDelayLabel
                  }
                  snapshotFirstFrameDelayHint={copy.snapshotFirstFrameDelayHint}
                  recordingEnabled={recordingEnabled}
                  onToggleRecording={onToggleRecording}
                  recordingLabel={copy.recordingLabel}
                  recordingHint={copy.recordingHint}
                  fetchDelay={fetchDelay}
                  onFetchDelayChange={onFetchDelayChange}
                  fetchDelayLabel={copy.fetchDelayLabel}
                  fetchDelayHint={copy.fetchDelayHint}
                  disabled={disabled}
                />
              </CardContent>
            </Card>
          </>
        )}
      </FormShell>

      <CameraPicker
        open={pickerOpen}
        onOpenChange={onPickerOpenChange}
        title={copy.pickerTitle}
        cameras={cameraOptions}
        selectedCameraId={selectedCameraId}
        onSelect={onSelectCamera}
        noneLabel={copy.noneSource}
        emptyLabel={copy.pickerEmpty}
      />

      <DiscardUnsavedDialog {...discardConfirm} />
    </div>
  );
};

export { CameraTabView, type CameraTabViewProps };
