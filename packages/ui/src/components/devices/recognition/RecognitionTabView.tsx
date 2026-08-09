import * as React from 'react';
import { Cpu, Loader2, PawPrint, Pencil, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FormShell, LabeledSwitchField } from '@/components/ui/form';
import {
  DeviceModelRow,
  DeviceModelRowTile,
} from '@/components/devices/camera';
import ReferenceImagePicker from '@/components/devices/ReferenceImagePicker';
import TestRecognitionModal from '@/components/devices/TestRecognitionModal';
import type { RecognitionGate } from '@/lib/petRecognizerDraft';
import { RecognitionLockedState } from './RecognitionLockedState';
import { RecognitionEmptyState } from './RecognitionEmptyState';
import {
  RecognizerPicker,
  type RecognizerPickerOption,
} from './RecognizerPicker';
import { TrainedPetsEditor, type TrainedPetRow } from './TrainedPetsEditor';
import './RecognitionTabView.css';

interface RecognitionTabViewCopy {
  lockedTitle: string;
  lockedCta: string;
  providerHint: string;
  providerCta: string;
  emptyTitle: string;
  emptyCta: string;
  autoIdentifyLabel: string;
  autoIdentifyHint: string;
  modelTitle: string;
  modelSubtitle: string;
  modelNoneTitle: string;
  modelChangeLabel: string;
  modelSettingsLabel: string;
  pickerTitle: string;
  pickerEmpty: string;
  trainedPetsTitle: string;
  trainedPetsSubtitle: string;
  trainedPetsEmpty: string;
  testRecognitionLabel: string;
  cancelLabel: string;
  saveLabel: string;
  saveError: string;
}

interface RecognitionTabViewProps {
  copy: RecognitionTabViewCopy;
  gate: RecognitionGate;

  onGoToCamera: () => void;
  showProviderHint: boolean;
  onGoToProvider: () => void;
  onAddDevice: () => void;

  sourceDeviceId: number;
  selectedRecognizerId?: number;
  selectedRecognizerName?: string;
  selectedRecognizerModel?: string;
  recognizerOptions: RecognizerPickerOption[];
  onSelectRecognizer: (id: number) => void;
  onOpenRecognizerSettings: (id: number) => void;

  autoIdentify: boolean;
  onToggleAutoIdentify: (checked: boolean) => void;

  pets: TrainedPetRow[];
  onToggleWatched: (petId: number, watched: boolean) => void;
  onConfirmAddImages: (petId: number, mediaIds: number[]) => void;
  onRemoveImage: (petId: number, mediaId: number) => void;

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
 * Pure presentation for the device details Recognition tab. All data comes
 * from props; the `RecognitionTab` container owns queries, mutations, and the draft.
 * Owns only UI-local state (which row is expanded, which dialog is open) —
 * nothing here survives a remount and none of it is business data.
 */
const RecognitionTabView: React.FC<RecognitionTabViewProps> = ({
  copy,
  gate,
  onGoToCamera,
  showProviderHint,
  onGoToProvider,
  onAddDevice,
  sourceDeviceId,
  selectedRecognizerId,
  selectedRecognizerName,
  selectedRecognizerModel,
  recognizerOptions,
  onSelectRecognizer,
  onOpenRecognizerSettings,
  autoIdentify,
  onToggleAutoIdentify,
  pets,
  onToggleWatched,
  onConfirmAddImages,
  onRemoveImage,
  onSubmit,
  onCancel,
  isDirty,
  isSaving,
  saveFailed,
  discardConfirm,
  disabled,
}) => {
  const [recognizerPickerOpen, setRecognizerPickerOpen] = React.useState(false);
  const [expandedPetId, setExpandedPetId] = React.useState<number | null>(null);
  const [imagePickerPetId, setImagePickerPetId] = React.useState<number | null>(
    null,
  );
  const [testModalOpen, setTestModalOpen] = React.useState(false);

  const hasLinkedRecognizer = selectedRecognizerId != null;
  const imagePickerPet =
    imagePickerPetId != null
      ? pets.find((pet) => pet.id === imagePickerPetId)
      : undefined;

  if (gate === 'needs_camera') {
    return (
      <div className="recognition-tab-view">
        <RecognitionLockedState
          title={copy.lockedTitle}
          ctaLabel={copy.lockedCta}
          onGoToCamera={onGoToCamera}
          showProviderHint={showProviderHint}
          providerHint={copy.providerHint}
          providerCtaLabel={copy.providerCta}
          onGoToProvider={onGoToProvider}
        />
      </div>
    );
  }

  if (gate === 'empty') {
    return (
      <div className="recognition-tab-view">
        <RecognitionEmptyState
          title={copy.emptyTitle}
          ctaLabel={copy.emptyCta}
          onAddDevice={onAddDevice}
        />
      </div>
    );
  }

  return (
    <div className="recognition-tab-view">
      <FormShell
        className="recognition-tab-form"
        onSubmit={onSubmit}
        error={saveFailed ? copy.saveError : null}
        actionsSlot={
          hasLinkedRecognizer ? (
            <div className="recognition-tab-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setTestModalOpen(true)}
              >
                <Sparkles size="1em" aria-hidden="true" />
                {copy.testRecognitionLabel}
              </Button>
              <div className="recognition-tab-actions-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCancel}
                  disabled={isSaving}
                >
                  {copy.cancelLabel}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!isDirty || isSaving}
                  aria-busy={isSaving || undefined}
                >
                  {isSaving && (
                    <Loader2 className="animate-spin" size="1em" aria-hidden />
                  )}
                  {copy.saveLabel}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        <SectionHeader
          size="compact"
          className="first"
          icon={<Cpu aria-hidden="true" />}
          subtitle={copy.modelSubtitle}
        >
          {copy.modelTitle}
        </SectionHeader>
        <Card className="recognition-tab-card">
          <CardContent>
            <div className="recognition-model-stack">
              {hasLinkedRecognizer && (
                <div className="auto-identify-field">
                  <LabeledSwitchField
                    checked={autoIdentify}
                    onCheckedChange={onToggleAutoIdentify}
                    enabledLabel={copy.autoIdentifyLabel}
                    disabledLabel={copy.autoIdentifyLabel}
                    disabled={disabled}
                  />
                  <p className="auto-identify-hint">{copy.autoIdentifyHint}</p>
                </div>
              )}
              <DeviceModelRow
                leading={
                  <DeviceModelRowTile
                    variant={hasLinkedRecognizer ? 'primary-lightest' : 'muted'}
                  >
                    <Cpu aria-hidden="true" />
                  </DeviceModelRowTile>
                }
                title={
                  hasLinkedRecognizer
                    ? selectedRecognizerName
                    : copy.modelNoneTitle
                }
                subtitle={
                  hasLinkedRecognizer ? selectedRecognizerModel : undefined
                }
                action={
                  <div className="recognition-model-row-actions">
                    {(hasLinkedRecognizer
                      ? recognizerOptions.length > 1
                      : recognizerOptions.length > 0) && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setRecognizerPickerOpen(true)}
                        disabled={disabled}
                      >
                        {copy.modelChangeLabel}
                      </Button>
                    )}
                    {selectedRecognizerId != null && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon
                        onClick={() =>
                          onOpenRecognizerSettings(selectedRecognizerId)
                        }
                        aria-label={copy.modelSettingsLabel}
                        title={copy.modelSettingsLabel}
                        disabled={disabled}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                }
              />
            </div>
          </CardContent>
        </Card>

        {hasLinkedRecognizer && (
          <>
            <SectionHeader
              size="compact"
              icon={<PawPrint aria-hidden="true" />}
              subtitle={copy.trainedPetsSubtitle}
            >
              {copy.trainedPetsTitle}
            </SectionHeader>
            <Card className="recognition-tab-card">
              <CardContent noPadding>
                <TrainedPetsEditor
                  pets={pets}
                  emptyLabel={copy.trainedPetsEmpty}
                  expandedPetId={expandedPetId}
                  onToggleExpand={(petId) =>
                    setExpandedPetId((current) =>
                      current === petId ? null : petId,
                    )
                  }
                  onToggleWatched={onToggleWatched}
                  onAddImages={setImagePickerPetId}
                  onRemoveImage={onRemoveImage}
                  disabled={disabled}
                />
              </CardContent>
            </Card>
          </>
        )}
      </FormShell>

      <RecognizerPicker
        open={recognizerPickerOpen}
        onOpenChange={setRecognizerPickerOpen}
        title={copy.pickerTitle}
        recognizers={recognizerOptions}
        selectedId={selectedRecognizerId}
        onSelect={(id) => {
          setRecognizerPickerOpen(false);
          onSelectRecognizer(id);
        }}
        emptyLabel={copy.pickerEmpty}
      />

      {imagePickerPetId != null && (
        <ReferenceImagePicker
          isOpen
          onClose={() => setImagePickerPetId(null)}
          petId={imagePickerPetId}
          sourceDeviceId={sourceDeviceId}
          excludeMediaIds={imagePickerPet?.referenceImageIds}
          onSelect={(mediaIds) => {
            onConfirmAddImages(imagePickerPetId, mediaIds);
            setImagePickerPetId(null);
          }}
        />
      )}

      {selectedRecognizerId != null && (
        <TestRecognitionModal
          isOpen={testModalOpen}
          onClose={() => setTestModalOpen(false)}
          deviceId={selectedRecognizerId}
          sourceDeviceId={sourceDeviceId}
        />
      )}

      <DiscardUnsavedDialog {...discardConfirm} />
    </div>
  );
};

export {
  RecognitionTabView,
  type RecognitionTabViewProps,
  type RecognitionTabViewCopy,
};
