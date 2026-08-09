import * as React from 'react';
import { Input, LabeledSwitchField } from '@/components/ui/form';
import { FormField, useFormFieldA11y } from '@/components/ui/form/FormField';
import './CameraCaptureFields.css';

interface CameraCaptureFieldsProps {
  snapshotEnabled: boolean;
  onToggleSnapshot: (checked: boolean) => void;
  snapshotLabel: string;
  snapshotHint?: string;
  snapshotIntervalSec: number;
  onSnapshotIntervalChange: (value: number) => void;
  snapshotIntervalLabel: string;
  snapshotIntervalHint: string;
  snapshotFirstFrameDelaySec: number;
  onSnapshotFirstFrameDelayChange: (value: number) => void;
  snapshotFirstFrameDelayLabel: string;
  snapshotFirstFrameDelayHint: string;

  recordingEnabled: boolean;
  onToggleRecording: (checked: boolean) => void;
  recordingLabel: string;
  recordingHint?: string;
  fetchDelay: number;
  onFetchDelayChange: (value: number) => void;
  fetchDelayLabel: string;
  fetchDelayHint: string;

  disabled?: boolean;
}

function toNonNegativeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

interface CaptureNumberFieldProps {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  disabled?: boolean;
}

/**
 * Non-negative number field for the capture drafts. While focused the raw
 * text is authoritative, so the user can clear the field and retype without
 * the controlled value snapping it back to 0; blur commits a number.
 */
const CaptureNumberField: React.FC<CaptureNumberFieldProps> = ({
  label,
  hint,
  value,
  onChange,
  step,
  disabled,
}) => {
  const a11y = useFormFieldA11y(undefined, true);
  const [text, setText] = React.useState<string | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setText(raw);
    if (raw !== '') onChange(toNonNegativeNumber(raw));
  };

  const handleBlur = () => {
    if (text === '') onChange(0);
    setText(null);
  };

  return (
    <FormField
      className="camera-capture-field"
      label={label}
      description={hint}
      htmlFor={a11y.inputId}
      descriptionId={a11y.descriptionId}
    >
      <Input
        id={a11y.inputId}
        aria-describedby={a11y.descriptionId}
        type="number"
        min={0}
        step={step}
        value={text ?? String(value)}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
      />
    </FormField>
  );
};

/**
 * Snapshot / recording acquisition switches, each with its own fold-out of
 * timing fields. Pure props in, pure callbacks out.
 */
const CameraCaptureFields: React.FC<CameraCaptureFieldsProps> = ({
  snapshotEnabled,
  onToggleSnapshot,
  snapshotLabel,
  snapshotHint,
  snapshotIntervalSec,
  onSnapshotIntervalChange,
  snapshotIntervalLabel,
  snapshotIntervalHint,
  snapshotFirstFrameDelaySec,
  onSnapshotFirstFrameDelayChange,
  snapshotFirstFrameDelayLabel,
  snapshotFirstFrameDelayHint,
  recordingEnabled,
  onToggleRecording,
  recordingLabel,
  recordingHint,
  fetchDelay,
  onFetchDelayChange,
  fetchDelayLabel,
  fetchDelayHint,
  disabled,
}) => {
  return (
    <div className="camera-capture-fields">
      <div className="camera-capture-option">
        <div className="camera-capture-option-toggle">
          <LabeledSwitchField
            checked={snapshotEnabled}
            onCheckedChange={onToggleSnapshot}
            enabledLabel={snapshotLabel}
            disabledLabel={snapshotLabel}
            disabled={disabled}
          />
          {snapshotHint && (
            <p className="camera-capture-option-hint">{snapshotHint}</p>
          )}
        </div>
        {snapshotEnabled && (
          <div className="camera-capture-fields-foldout">
            <div className="camera-capture-fields-pair">
              <CaptureNumberField
                label={snapshotIntervalLabel}
                hint={snapshotIntervalHint}
                value={snapshotIntervalSec}
                onChange={onSnapshotIntervalChange}
                step={0.1}
                disabled={disabled}
              />
              <CaptureNumberField
                label={snapshotFirstFrameDelayLabel}
                hint={snapshotFirstFrameDelayHint}
                value={snapshotFirstFrameDelaySec}
                onChange={onSnapshotFirstFrameDelayChange}
                step={0.1}
                disabled={disabled}
              />
            </div>
          </div>
        )}
      </div>

      <div className="camera-capture-option">
        <div className="camera-capture-option-toggle">
          <LabeledSwitchField
            checked={recordingEnabled}
            onCheckedChange={onToggleRecording}
            enabledLabel={recordingLabel}
            disabledLabel={recordingLabel}
            disabled={disabled}
          />
          {recordingHint && (
            <p className="camera-capture-option-hint">{recordingHint}</p>
          )}
        </div>
        {recordingEnabled && (
          <div className="camera-capture-fields-foldout">
            <CaptureNumberField
              label={fetchDelayLabel}
              hint={fetchDelayHint}
              value={fetchDelay}
              onChange={onFetchDelayChange}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export { CameraCaptureFields, type CameraCaptureFieldsProps };
