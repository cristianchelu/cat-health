import * as React from 'react';
import { Cpu, PawPrint, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  FormShell,
  Input,
  LabeledSwitchField,
  Textarea,
} from '@/components/ui/form';
import { FormField, useFormFieldA11y } from '@/components/ui/form/FormField';
import {
  CardList,
  CardListContent,
  CardListItem,
} from '@/components/ui/CardList';
import ReferenceImagePicker from '@/components/devices/ReferenceImagePicker';
import TestRecognitionModal from '@/components/devices/TestRecognitionModal';
import type { RecognitionGate } from '@/lib/recognitionConfig';
import { RecognitionLockedState } from './RecognitionLockedState';
import { RecognitionEmptyState } from './RecognitionEmptyState';
import {
  RecognitionAccountPicker,
  type RecognitionAccountOption,
} from './RecognitionAccountPicker';
import { TrainedPetsEditor, type TrainedPetRow } from './TrainedPetsEditor';
import './RecognitionTabView.css';

interface RecognitionTabViewCopy {
  lockedTitle: string;
  lockedCta: string;
  providerHint: string;
  providerCta: string;
  noAccountTitle: string;
  noAccountCta: string;
  autoIdentifyLabel: string;
  autoIdentifyHint: string;
  accountTitle: string;
  accountSubtitle: string;
  accountNoneSelected: string;
  accountChangeLabel: string;
  accountPickerTitle: string;
  accountPickerEmpty: string;
  accountNoneLabel: string;
  modelLabel: string;
  modelPlaceholder: string;
  modelHint: string;
  promptLabel: string;
  promptHint: string;
  promptPlaceholder: string;
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

  /** The observed device — what reference images are picked from, and what Test Recognition runs against. */
  deviceId: number;
  accountOptions: RecognitionAccountOption[];
  selectedAccountId: number | null;
  selectedAccountName?: string;
  onSelectAccount: (id: number | null) => void;
  /** True once the device actually has a stored attachment, not merely a drafted one. */
  hasSavedRecognition: boolean;

  model: string;
  onModelChange: (value: string) => void;
  promptTemplate: string;
  onPromptTemplateChange: (value: string) => void;

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
 * from props; the `RecognitionTab` container owns queries, mutations, and the
 * draft. Owns only UI-local state (which row is expanded, which dialog is
 * open) — nothing here survives a remount and none of it is business data.
 */
const RecognitionTabView: React.FC<RecognitionTabViewProps> = ({
  copy,
  gate,
  onGoToCamera,
  showProviderHint,
  onGoToProvider,
  deviceId,
  accountOptions,
  selectedAccountId,
  selectedAccountName,
  onSelectAccount,
  hasSavedRecognition,
  model,
  onModelChange,
  promptTemplate,
  onPromptTemplateChange,
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
  const [accountPickerOpen, setAccountPickerOpen] = React.useState(false);
  const [expandedPetId, setExpandedPetId] = React.useState<number | null>(null);
  const [imagePickerPetId, setImagePickerPetId] = React.useState<number | null>(
    null,
  );
  const [testModalOpen, setTestModalOpen] = React.useState(false);
  const modelField = useFormFieldA11y(undefined, true);
  const promptField = useFormFieldA11y(undefined, true);

  const hasAccount = selectedAccountId != null;
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

  if (gate === 'no_account') {
    return (
      <div className="recognition-tab-view">
        <RecognitionEmptyState
          title={copy.noAccountTitle}
          ctaLabel={copy.noAccountCta}
          onConnectProvider={onGoToProvider}
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
        actions={{
          onCancel,
          cancelLabel: copy.cancelLabel,
          submitLabel: copy.saveLabel,
          isSubmitting: isSaving,
          submitDisabled: !isDirty,
        }}
      >
        <SectionHeader
          size="compact"
          className="first"
          icon={<Cpu aria-hidden="true" />}
          subtitle={copy.accountSubtitle}
        >
          {copy.accountTitle}
        </SectionHeader>
        <Card className="recognition-tab-card">
          <CardContent>
            <div className="recognition-model-stack">
              <CardList variant="bare">
                <CardListItem
                  icon={<Cpu aria-hidden="true" />}
                  iconTone={hasAccount ? 'primary' : 'muted'}
                  trailing={
                    <div className="recognition-model-row-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setAccountPickerOpen(true)}
                        disabled={disabled}
                      >
                        {copy.accountChangeLabel}
                      </Button>
                    </div>
                  }
                >
                  <CardListContent
                    title={
                      hasAccount
                        ? selectedAccountName
                        : copy.accountNoneSelected
                    }
                  />
                </CardListItem>
              </CardList>

              {hasAccount && (
                <>
                  <div className="auto-identify-field">
                    <LabeledSwitchField
                      checked={autoIdentify}
                      onCheckedChange={onToggleAutoIdentify}
                      enabledLabel={copy.autoIdentifyLabel}
                      disabledLabel={copy.autoIdentifyLabel}
                      disabled={disabled}
                    />
                    <p className="auto-identify-hint">
                      {copy.autoIdentifyHint}
                    </p>
                  </div>

                  <FormField
                    label={copy.modelLabel}
                    description={copy.modelHint}
                    htmlFor={modelField.inputId}
                    descriptionId={modelField.descriptionId}
                  >
                    <Input
                      id={modelField.inputId}
                      aria-describedby={modelField.descriptionId}
                      value={model}
                      placeholder={copy.modelPlaceholder}
                      onChange={(event) => onModelChange(event.target.value)}
                      disabled={disabled}
                    />
                  </FormField>

                  <FormField
                    label={copy.promptLabel}
                    description={copy.promptHint}
                    htmlFor={promptField.inputId}
                    descriptionId={promptField.descriptionId}
                  >
                    <Textarea
                      id={promptField.inputId}
                      aria-describedby={promptField.descriptionId}
                      rows={8}
                      value={promptTemplate}
                      placeholder={copy.promptPlaceholder}
                      onChange={(event) =>
                        onPromptTemplateChange(event.target.value)
                      }
                      disabled={disabled}
                    />
                  </FormField>
                </>
              )}

              {/*
               * A card-local tool, not a commit: it runs the saved attachment
               * against a live frame and writes nothing, so it sits at the
               * point of use rather than in the form's Save row. Gated on the
               * *saved* link, since that is what the server reads.
               */}
              {hasSavedRecognition && (
                <div className="recognition-card-tools">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setTestModalOpen(true)}
                    disabled={disabled}
                  >
                    <Sparkles size="1em" aria-hidden="true" />
                    {copy.testRecognitionLabel}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {hasAccount && (
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

      <RecognitionAccountPicker
        open={accountPickerOpen}
        onOpenChange={setAccountPickerOpen}
        title={copy.accountPickerTitle}
        accounts={accountOptions}
        selectedId={selectedAccountId}
        onSelect={(id) => {
          setAccountPickerOpen(false);
          onSelectAccount(id);
        }}
        noneLabel={copy.accountNoneLabel}
        emptyLabel={copy.accountPickerEmpty}
      />

      {imagePickerPetId != null && (
        <ReferenceImagePicker
          isOpen
          onClose={() => setImagePickerPetId(null)}
          petId={imagePickerPetId}
          sourceDeviceId={deviceId}
          excludeMediaIds={imagePickerPet?.referenceImageIds}
          onSelect={(mediaIds) => {
            onConfirmAddImages(imagePickerPetId, mediaIds);
            setImagePickerPetId(null);
          }}
        />
      )}

      {hasSavedRecognition && (
        <TestRecognitionModal
          isOpen={testModalOpen}
          onClose={() => setTestModalOpen(false)}
          deviceId={deviceId}
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
