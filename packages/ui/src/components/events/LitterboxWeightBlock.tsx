import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormActions } from '@/components/ui/form';
import {
  gramsToKgDisplay,
  gramsToKgInput,
  MAX_WEIGHT_G,
  MIN_WEIGHT_G,
  parseKgInput,
  useLitterboxWeightEdit,
  WeightOutOfRangeError,
  type LitterboxWeightParentEvent,
} from './useLitterboxWeightEdit';
import './LitterboxWeightBlock.css';

export interface LitterboxWeightBlockProps {
  parentEvent: LitterboxWeightParentEvent;
}

/**
 * The visit's cat weight, read and corrected in place.
 *
 * Kept for the annotation workspace, where the weight sits beside the signal
 * being annotated. The event details surface reaches the same edit through its
 * one edit form instead — see `EventEditForm`.
 */
const LitterboxWeightBlock = ({ parentEvent }: LitterboxWeightBlockProps) => {
  const { t } = useTranslation();
  const { weightGrams, saveWeight, isSaving } =
    useLitterboxWeightEdit(parentEvent);

  const [isEditing, setIsEditing] = React.useState(false);
  const [draftKg, setDraftKg] = React.useState('');
  const [reidentifyAfterSave, setReidentifyAfterSave] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const startEdit = () => {
    setDraftKg(weightGrams != null ? gramsToKgInput(weightGrams) : '');
    setReidentifyAfterSave(false);
    setError(null);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    try {
      await saveWeight(parseKgInput(draftKg), {
        reidentify: reidentifyAfterSave,
      });
      setIsEditing(false);
    } catch (e) {
      setError(
        e instanceof WeightOutOfRangeError
          ? t('event_details.weight_out_of_range')
          : t('event_details.weight_save_failed'),
      );
    }
  };

  if (isEditing) {
    return (
      <div className="litterbox-weight-block editing">
        <div className="litterbox-weight-block-edit-row">
          <span className="litterbox-weight-block-label">
            {t('event_details.weight')}
          </span>
          <div className="litterbox-weight-block-input-wrap">
            <input
              type="number"
              step="0.01"
              min={MIN_WEIGHT_G / 1000}
              max={MAX_WEIGHT_G / 1000}
              value={draftKg}
              onChange={(e) => setDraftKg(e.target.value)}
              className="litterbox-weight-block-input"
              disabled={isSaving}
              aria-label={t('event_details.weight')}
            />
            <span className="litterbox-weight-block-unit">kg</span>
          </div>
        </div>
        {error && <p className="litterbox-weight-block-error">{error}</p>}
        <Checkbox
          checked={reidentifyAfterSave}
          onCheckedChange={setReidentifyAfterSave}
          disabled={isSaving || parentEvent.device_id == null}
          label={t('event_details.reidentify_later_visits')}
        />
        <FormActions
          className="litterbox-weight-block-actions"
          onCancel={cancelEdit}
          cancelLabel={t('common.cancel')}
          submitLabel={t('common.save')}
          isSubmitting={isSaving}
          submitType="button"
          onSubmitClick={() => void handleSave()}
        />
      </div>
    );
  }

  return (
    <div className="litterbox-weight-block">
      <span className="litterbox-weight-block-label">
        {t('event_details.weight')}
      </span>
      <span className="litterbox-weight-block-value">
        {weightGrams != null ? gramsToKgDisplay(weightGrams) : '—'}
      </span>
      <Button
        type="button"
        variant="ghost"
        icon
        className="litterbox-weight-block-edit"
        onClick={startEdit}
        title={t('event_details.edit_weight')}
        aria-label={t('event_details.edit_weight')}
      >
        <Pencil size={16} aria-hidden />
      </Button>
    </div>
  );
};

LitterboxWeightBlock.displayName = 'LitterboxWeightBlock';

export default LitterboxWeightBlock;
