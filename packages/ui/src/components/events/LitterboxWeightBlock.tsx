import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil } from 'lucide-react';
import type {
  GetEventChildDTO,
  GetEventDTO,
  GetEventWithChildrenDTO,
} from 'shared';
import { Button } from '@/components/ui/Button';
import { addEvent } from '@/api/pets';
import { reidentifyLitterboxVisits } from '@/api/devices';
import {
  invalidateQueriesAfterEventPatch,
  useDeleteEvent,
  useUpdateEvent,
} from '@/hooks/queries/eventQueries';
import './LitterboxWeightBlock.css';

const MIN_WEIGHT_G = 500;
const MAX_WEIGHT_G = 20_000;

type ParentEvent = GetEventWithChildrenDTO | (GetEventDTO & { children?: GetEventChildDTO[] });

function findWeightChild(parent: ParentEvent): GetEventChildDTO | undefined {
  return parent.children?.find(
    (c) => (c.data as { type?: string })?.type === 'weight_measurement',
  );
}

function gramsToKgDisplay(grams: number): string {
  return `${(grams / 1000).toFixed(2)} kg`;
}

function parseKgInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const kg = Number.parseFloat(trimmed);
  if (!Number.isFinite(kg)) return null;
  return Math.round(kg * 1000);
}

export interface LitterboxWeightBlockProps {
  parentEvent: ParentEvent;
}

const LitterboxWeightBlock = ({ parentEvent }: LitterboxWeightBlockProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutateAsync: updateEvent, isPending: isUpdating } = useUpdateEvent();
  const { mutateAsync: deleteEvent, isPending: isDeleting } = useDeleteEvent();

  const weightChild = findWeightChild(parentEvent);
  const weightGrams =
    weightChild && (weightChild.data as { weight?: number }).weight != null
      ? (weightChild.data as { weight: number }).weight
      : null;

  const [isEditing, setIsEditing] = React.useState(false);
  const [draftKg, setDraftKg] = React.useState('');
  const [reidentifyAfterSave, setReidentifyAfterSave] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isSaving = isUpdating || isDeleting;

  const refreshAfterChange = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['event', parentEvent.id] });
    invalidateQueriesAfterEventPatch(queryClient);
    if (parentEvent.pet_id != null) {
      await queryClient.invalidateQueries({ queryKey: ['weightTrends', parentEvent.pet_id] });
    }
  }, [parentEvent.id, parentEvent.pet_id, queryClient]);

  const runReidentifyIfNeeded = React.useCallback(async () => {
    if (!reidentifyAfterSave || parentEvent.device_id == null) return;
    const after =
      typeof parentEvent.timestamp === 'string'
        ? parentEvent.timestamp
        : new Date(parentEvent.timestamp as string | number | Date).toISOString();
    await reidentifyLitterboxVisits(parentEvent.device_id, after);
    invalidateQueriesAfterEventPatch(queryClient);
    await queryClient.invalidateQueries({ queryKey: ['litterboxTrends'] });
  }, [parentEvent.device_id, parentEvent.timestamp, queryClient, reidentifyAfterSave]);

  const startEdit = () => {
    setDraftKg(weightGrams != null ? (weightGrams / 1000).toFixed(2) : '');
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
    const grams = parseKgInput(draftKg);

    try {
      if (grams === null) {
        if (weightChild) {
          await deleteEvent(weightChild.id);
        }
      } else if (grams < MIN_WEIGHT_G || grams > MAX_WEIGHT_G) {
        setError(t('event_details.weight_out_of_range'));
        return;
      } else if (weightChild) {
        await updateEvent({
          eventId: weightChild.id,
          data: {
            data: { type: 'weight_measurement', weight: grams },
            human_verified: true,
          },
        });
      } else {
        await addEvent({
          parent_event_id: parentEvent.id,
          pet_id: parentEvent.pet_id,
          device_id: parentEvent.device_id,
          timestamp: parentEvent.timestamp,
          data: { type: 'weight_measurement', weight: grams },
          human_verified: true,
        });
      }

      await runReidentifyIfNeeded();
      await refreshAfterChange();
      setIsEditing(false);
    } catch {
      setError(t('event_details.weight_save_failed'));
    }
  };

  if (isEditing) {
    return (
      <div className="litterbox-weight-block editing">
        <div className="litterbox-weight-block-edit-row">
          <span className="litterbox-weight-block-label">{t('event_details.weight')}</span>
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
        <label className="litterbox-weight-block-checkbox">
          <input
            type="checkbox"
            checked={reidentifyAfterSave}
            onChange={(e) => setReidentifyAfterSave(e.target.checked)}
            disabled={isSaving || parentEvent.device_id == null}
          />
          <span>{t('event_details.reidentify_later_visits')}</span>
        </label>
        <div className="litterbox-weight-block-actions">
          <Button type="button" variant="secondary" size="sm" onClick={cancelEdit} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : t('common.save')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="litterbox-weight-block">
      <span className="litterbox-weight-block-label">{t('event_details.weight')}</span>
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
