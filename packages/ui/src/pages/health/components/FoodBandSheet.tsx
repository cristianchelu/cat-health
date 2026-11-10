import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Drumstick } from 'lucide-react';
import {
  ENERGY_MODELS,
  boundsOf,
  resolveFoodBand,
  type FoodPreset,
  type GetDietaryNeedsResponse,
  type GetPetResponseDTO,
  type PutDietaryNeedsRequest,
} from 'shared';

import { FormField, useFormFieldA11y } from '@/components/ui/form/FormField';
import { Input } from '@/components/ui/form/Input';
import type { LabelValueRow } from '@/components/ui/LabelValueRows';
import { useFormatters } from '@/hooks/context/useRegionalPreferences';
import { useDraftForm } from '@/hooks/form';
import type { TranslationKey } from '@/lib/translationKey';

import {
  draftOf,
  foodChange,
  foodDraftFromNeeds,
  foodNotches,
  foodScale,
  foodSettingOf,
  holding,
  intakePetFor,
  parseTargetWeight,
  presetAt,
  restingKcal,
  withTarget,
  withTolerance,
  type BandDraft,
} from '../dietaryNeedsModel';
import { BandCitation } from './BandCitation';
import { BandSheet } from './BandSheet';
import { GAP_KEYS } from './gapKeys';
import { IntakeBandEditor } from './IntakeBandEditor';
import './FoodBandSheet.css';

/** The name of each food notch. */
const FOOD_OPTION_KEYS: Record<FoodPreset, TranslationKey> = {
  maintain: 'health.dietary_needs.food_option_maintain',
  lose: 'health.dietary_needs.food_option_lose',
};

interface FoodBandSheetProps {
  open: boolean;
  onClose: () => void;
  pet: GetPetResponseDTO;
  needs: GetDietaryNeedsResponse;
  /** The calendar day her age is read on, `yyyy-MM-dd`. */
  today: string;
  /** Resolves true once the change is saved. */
  onSave: (change: PutDietaryNeedsRequest) => Promise<boolean>;
  error: string | null;
  isSaving: boolean;
}

/**
 * The food band's editor: its draft, the notches and band it resolves to as
 * it changes, and the copy. The target weight is edited here because it is
 * what moves the Lose notch.
 */
const FoodBandSheet: React.FC<FoodBandSheetProps> = ({
  open,
  onClose,
  pet,
  needs,
  today,
  onSave,
  error,
  isSaving,
}) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormatters();

  const baseline = React.useMemo(() => foodDraftFromNeeds(needs), [needs]);
  const { draft, patchDraft, isDirty, commit, requestDiscard, discardConfirm } =
    useDraftForm(baseline, { baselineKey: JSON.stringify(baseline) });
  const targetWeightField = useFormFieldA11y(undefined, true);

  const targetWeight = parseTargetWeight(draft.targetWeight);
  const targetWeightInvalid = targetWeight === 'invalid';

  const save = async () => {
    const saved = await onSave(foodChange(draft));
    if (!saved) return;
    commit();
    onClose();
  };

  const editor = () => {
    const weightKg = needs.weight_kg;
    if (weightKg === null) {
      return (
        <p className="food-band-sheet-notice">
          {t('health.dietary_needs.never_weighed', { pet: pet.name })}
        </p>
      );
    }

    const intakePet = intakePetFor({
      birthDate: pet.birth_date,
      altered: pet.altered,
      weightKg,
      targetWeightKg: targetWeightInvalid ? null : targetWeight,
      today,
    });
    const plan = needs.food.plan;
    const stops = foodNotches(plan, intakePet, draft.setting);
    const band = draftOf(draft.setting, stops);
    const floor = foodScale(intakePet).min;
    const track = holding(foodScale(intakePet), band);
    const resolved = resolveFoodBand(draft.setting, plan, intakePet);
    const resting = restingKcal(intakePet);
    const setBand = (next: BandDraft) =>
      patchDraft({ setting: foodSettingOf(next, stops) });

    const weight = formatNumber(weightKg, { maximumFractionDigits: 2 });
    const whole = (value: number) =>
      formatNumber(value, { maximumFractionDigits: 0 });

    const rows: LabelValueRow[] = [
      {
        key: 'resting',
        label: t('health.dietary_needs.row_label_resting', { weight }),
        value: t('health.dietary_needs.kcal_value', { value: whole(resting) }),
      },
    ];
    if (!('gap' in resolved)) {
      const { lower, upper } = boundsOf(resolved);
      rows.push({
        key: 'band',
        label: t('health.dietary_needs.row_label_band', {
          pet: pet.name,
          weight,
        }),
        value: t('health.dietary_needs.kcal_range_a_day', {
          low: whole(lower),
          high: whole(upper),
        }),
      });
    }
    rows.push({
      key: 'floor',
      label: t('health.dietary_needs.row_label_floor'),
      value: t('health.dietary_needs.kcal_value', { value: whole(floor) }),
    });

    const citation =
      !('gap' in resolved) && resolved.origin.kind === 'preset' ? (
        <BandCitation
          sourceId={ENERGY_MODELS[resolved.origin.modelId].sourceId}
          reference={resolved.origin.ref}
          adjustments={resolved.adjustments}
        />
      ) : undefined;

    return (
      <IntakeBandEditor
        band={band}
        noBandNotice={'gap' in resolved ? t(GAP_KEYS[resolved.gap]) : ''}
        unit={t('health.dietary_needs.unit_kcal')}
        note={
          band
            ? t('health.dietary_needs.food_note', {
                factor: formatNumber(band.target / resting, {
                  maximumFractionDigits: 2,
                }),
              })
            : ''
        }
        hint={citation}
        scale={track}
        notches={stops.map((stop) => ({
          key: stop.preset,
          value: stop.target,
          label: t(FOOD_OPTION_KEYS[stop.preset]),
        }))}
        activeNotch={band ? presetAt(band, stops) : null}
        onTargetChange={(target) => {
          if (band) setBand(withTarget(band, target, track, floor));
        }}
        onToleranceChange={(tolerance) => {
          if (band) setBand(withTolerance(band, tolerance, floor));
        }}
        onNotchSelect={(key) => {
          const stop = stops.find((s) => s.preset === key);
          if (stop) patchDraft({ setting: { preset: stop.preset } });
        }}
        targetLabel={t('health.dietary_needs.target_label')}
        toleranceLabel={t('health.dietary_needs.tolerance_label')}
        rows={rows}
      >
        <FormField
          label={t('health.dietary_needs.target_weight_label')}
          description={t('health.dietary_needs.target_weight_description', {
            weight,
          })}
          error={
            targetWeightInvalid
              ? t('health.dietary_needs.target_weight_error')
              : undefined
          }
          htmlFor={targetWeightField.inputId}
          descriptionId={targetWeightField.descriptionId}
        >
          <div className="food-band-sheet-target-weight">
            <Input
              id={targetWeightField.inputId}
              className="food-band-sheet-target-weight-input"
              inputMode="decimal"
              variant={targetWeightInvalid ? 'error' : 'default'}
              aria-describedby={targetWeightField.descriptionId}
              aria-invalid={targetWeightInvalid || undefined}
              value={draft.targetWeight}
              onChange={(e) => patchDraft({ targetWeight: e.target.value })}
            />
            <span className="food-band-sheet-unit">
              {t('health.dietary_needs.unit_kg')}
            </span>
          </div>
        </FormField>
      </IntakeBandEditor>
    );
  };

  return (
    <BandSheet
      open={open}
      onRequestClose={() => requestDiscard(onClose)}
      canDismiss={!isDirty}
      icon={<Drumstick />}
      title={t('health.dietary_needs.food_title')}
      tracked={draft.tracked}
      onTrackedChange={(tracked) => patchDraft({ tracked })}
      trackedLabel={t('health.dietary_needs.tracked')}
      untrackedLabel={t('health.dietary_needs.not_tracked')}
      trackSwitchLabel={t('health.dietary_needs.track_food_label')}
      error={error}
      discard={discardConfirm}
      keepLabel={t('common.keep_editing')}
      discardLabel={t('common.discard')}
      cancelLabel={t('common.cancel')}
      saveLabel={t('common.save')}
      onSave={() => void save()}
      isSaving={isSaving}
      saveDisabled={!isDirty || targetWeightInvalid}
    >
      {/* Wrapped so the sheet's own class can lay the field out inside it. */}
      <div className="food-band-sheet">{editor()}</div>
    </BandSheet>
  );
};

export { FoodBandSheet, type FoodBandSheetProps };
