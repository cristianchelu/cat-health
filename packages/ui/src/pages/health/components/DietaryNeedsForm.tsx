import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Drumstick, GlassWater } from 'lucide-react';
import {
  boundsOf,
  resolveFoodBand,
  resolveWaterBand,
  type FoodPreset,
  type GetDietaryNeedsResponse,
  type GetPetResponseDTO,
  type IntakeGap,
  type PutDietaryNeedsRequest,
  type WaterPreset,
} from 'shared';

import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { FormField, useFormFieldA11y } from '@/components/ui/form/FormField';
import { FormShell } from '@/components/ui/form/FormShell';
import { Input } from '@/components/ui/form/Input';
import type { LabelValueRow } from '@/components/ui/LabelValueRows';
import { useFormatters } from '@/hooks/context/useRegionalPreferences';
import { useDraftForm, useUnsavedBlocker } from '@/hooks/form';
import type { TranslationKey } from '@/lib/translationKey';

import {
  WATER_SCALE,
  changeFromDraft,
  draftFromNeeds,
  draftOf,
  foodNotches,
  foodScale,
  foodSettingOf,
  intakePetFor,
  parseTargetWeight,
  presetAt,
  restingKcal,
  waterNotches,
  waterSettingOf,
  withTarget,
  withTolerance,
  type BandDraft,
  type BandScale,
} from '../dietaryNeedsModel';
import { IntakeBandSection } from './IntakeBandSection';
import './DietaryNeedsForm.css';

/** The name of each food notch. */
const FOOD_OPTION_KEYS: Record<FoodPreset, TranslationKey> = {
  maintain: 'health.dietary_needs.food_option_maintain',
  lose: 'health.dietary_needs.food_option_lose',
};

/** The name of each water notch. */
const WATER_OPTION_KEYS: Record<WaterPreset, TranslationKey> = {
  normal: 'health.dietary_needs.water_option_normal',
  uti_prone: 'health.dietary_needs.water_option_uti_prone',
};

/** What to say when a preset has no band. */
const GAP_KEYS: Record<IntakeGap, TranslationKey> = {
  needs_target_weight: 'health.dietary_needs.gap_needs_target_weight',
  not_in_source: 'health.dietary_needs.gap_not_in_source',
};

/** A scale stretched to hold a band saved past its usual end, so the thumb is never off the track. */
function holding(scale: BandScale, band: BandDraft | null): BandScale {
  if (!band || band.target <= scale.max) return scale;
  return { ...scale, max: band.target };
}

interface DietaryNeedsFormProps {
  pet: GetPetResponseDTO;
  needs: GetDietaryNeedsResponse;
  /** The weight her bands are worked out at. */
  weightKg: number;
  /** The calendar day her age is read on, `yyyy-MM-dd`. */
  today: string;
  /** Resolves true once the change is saved. */
  onSave: (change: PutDietaryNeedsRequest) => Promise<boolean>;
  onCancel: () => void;
  error: string | null;
  isSaving: boolean;
}

/**
 * The Dietary needs form: the draft, the notches and bands it resolves to as
 * it changes, and the copy. A band is drafted as the setting it would save
 * as, so one on a notch follows it when a typed target weight moves the notch.
 */
const DietaryNeedsForm: React.FC<DietaryNeedsFormProps> = ({
  pet,
  needs,
  weightKg,
  today,
  onSave,
  onCancel,
  error,
  isSaving,
}) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormatters();

  const baseline = React.useMemo(() => draftFromNeeds(needs), [needs]);
  const { draft, patchDraft, isDirty, commit } = useDraftForm(baseline, {
    baselineKey: JSON.stringify(baseline),
  });
  const { blockerOpen, onConfirmLeave, onCancelLeave, markSaved } =
    useUnsavedBlocker(isDirty);
  const targetWeightField = useFormFieldA11y(undefined, true);

  const targetWeight = parseTargetWeight(draft.targetWeight);
  const targetWeightInvalid = targetWeight === 'invalid';
  const intakePet = intakePetFor({
    birthDate: pet.birth_date,
    altered: pet.altered,
    weightKg,
    targetWeightKg: targetWeightInvalid ? null : targetWeight,
    today,
  });

  const weight = formatNumber(weightKg, { maximumFractionDigits: 2 });
  const whole = (value: number) =>
    formatNumber(value, { maximumFractionDigits: 0 });

  // Food, in kcal a day.
  const foodPlan = needs.food.plan;
  const foodStops = foodNotches(foodPlan, intakePet);
  const foodBand = draftOf(draft.food, foodStops);
  const foodFloor = foodScale(intakePet).min;
  const foodTrack = holding(foodScale(intakePet), foodBand);
  const foodResolved = resolveFoodBand(draft.food, foodPlan, intakePet);
  const resting = restingKcal(intakePet);
  const setFoodBand = (band: BandDraft) =>
    patchDraft({ food: foodSettingOf(band, foodStops) });

  const foodRows: LabelValueRow[] = [
    {
      key: 'resting',
      label: t('health.dietary_needs.row_label_resting', { weight }),
      value: t('health.dietary_needs.kcal_value', { value: whole(resting) }),
    },
  ];
  if (!('gap' in foodResolved)) {
    const { lower, upper } = boundsOf(foodResolved);
    foodRows.push({
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
  foodRows.push({
    key: 'floor',
    label: t('health.dietary_needs.row_label_floor'),
    value: t('health.dietary_needs.kcal_value', { value: whole(foodFloor) }),
  });

  // Water, in ml per kg a day.
  const waterPlan = needs.water.plan;
  const waterStops = waterNotches(waterPlan, intakePet);
  const waterBand = draftOf(draft.water, waterStops);
  const waterTrack = holding(WATER_SCALE, waterBand);
  const waterResolved = resolveWaterBand(draft.water, waterPlan, intakePet);
  const setWaterBand = (band: BandDraft) =>
    patchDraft({ water: waterSettingOf(band, waterStops) });

  const waterRows: LabelValueRow[] = [];
  if (!('gap' in waterResolved)) {
    const { lower, upper } = boundsOf(waterResolved);
    waterRows.push({
      key: 'band',
      label: t('health.dietary_needs.row_label_band', {
        pet: pet.name,
        weight,
      }),
      value: t('health.dietary_needs.ml_range_a_day', {
        low: whole(lower),
        high: whole(upper),
      }),
    });
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const saved = await onSave(changeFromDraft(draft));
    if (!saved) return;
    commit();
    markSaved();
    onCancel();
  };

  return (
    <>
      <FormShell
        onSubmit={submit}
        error={error}
        actions={{
          onCancel,
          cancelLabel: t('common.cancel'),
          submitLabel: t('common.save'),
          isSubmitting: isSaving,
          submitDisabled: !isDirty || targetWeightInvalid || isSaving,
        }}
      >
        <div className="dietary-needs-form">
          <IntakeBandSection
            icon={<Drumstick />}
            title={t('health.dietary_needs.food_title')}
            tracked={draft.foodTracked}
            onTrackedChange={(foodTracked) => patchDraft({ foodTracked })}
            trackedLabel={t('health.dietary_needs.tracked')}
            untrackedLabel={t('health.dietary_needs.not_tracked')}
            trackSwitchLabel={t('health.dietary_needs.track_food_label')}
            band={foodBand}
            noBandNotice={
              'gap' in foodResolved ? t(GAP_KEYS[foodResolved.gap]) : ''
            }
            unit={t('health.dietary_needs.unit_kcal')}
            note={
              foodBand
                ? t('health.dietary_needs.food_note', {
                    factor: formatNumber(foodBand.target / resting, {
                      maximumFractionDigits: 2,
                    }),
                  })
                : ''
            }
            scale={foodTrack}
            notches={foodStops.map((stop) => ({
              key: stop.preset,
              value: stop.target,
              label: t(FOOD_OPTION_KEYS[stop.preset]),
            }))}
            activeNotch={foodBand ? presetAt(foodBand, foodStops) : null}
            onTargetChange={(target) => {
              if (!foodBand) return;
              setFoodBand(withTarget(foodBand, target, foodTrack, foodFloor));
            }}
            onToleranceChange={(tolerance) => {
              if (!foodBand) return;
              setFoodBand(withTolerance(foodBand, tolerance, foodFloor));
            }}
            onNotchSelect={(key) => {
              const stop = foodStops.find((s) => s.preset === key);
              if (stop) patchDraft({ food: { preset: stop.preset } });
            }}
            targetLabel={t('health.dietary_needs.target_label')}
            toleranceLabel={t('health.dietary_needs.tolerance_label')}
            rows={foodRows}
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
              <Input
                id={targetWeightField.inputId}
                inputMode="decimal"
                variant={targetWeightInvalid ? 'error' : 'default'}
                aria-describedby={targetWeightField.descriptionId}
                aria-invalid={targetWeightInvalid || undefined}
                value={draft.targetWeight}
                onChange={(e) => patchDraft({ targetWeight: e.target.value })}
              />
            </FormField>
          </IntakeBandSection>

          <IntakeBandSection
            icon={<GlassWater />}
            title={t('health.dietary_needs.water_title')}
            tracked={draft.waterTracked}
            onTrackedChange={(waterTracked) => patchDraft({ waterTracked })}
            trackedLabel={t('health.dietary_needs.tracked')}
            untrackedLabel={t('health.dietary_needs.not_tracked')}
            trackSwitchLabel={t('health.dietary_needs.track_water_label')}
            band={waterBand}
            noBandNotice={
              'gap' in waterResolved ? t(GAP_KEYS[waterResolved.gap]) : ''
            }
            unit={t('health.dietary_needs.unit_ml_per_kg')}
            note={
              'gap' in waterResolved
                ? ''
                : t('health.dietary_needs.water_note', {
                    amount: whole(waterResolved.target),
                  })
            }
            scale={waterTrack}
            notches={waterStops.map((stop) => ({
              key: stop.preset,
              value: stop.target,
              label: t(WATER_OPTION_KEYS[stop.preset]),
            }))}
            activeNotch={waterBand ? presetAt(waterBand, waterStops) : null}
            onTargetChange={(target) => {
              if (!waterBand) return;
              setWaterBand(withTarget(waterBand, target, waterTrack, 0));
            }}
            onToleranceChange={(tolerance) => {
              if (!waterBand) return;
              setWaterBand(withTolerance(waterBand, tolerance, 0));
            }}
            onNotchSelect={(key) => {
              const stop = waterStops.find((s) => s.preset === key);
              if (stop) patchDraft({ water: { preset: stop.preset } });
            }}
            targetLabel={t('health.dietary_needs.target_label')}
            toleranceLabel={t('health.dietary_needs.tolerance_label')}
            rows={waterRows}
          />
        </div>
      </FormShell>

      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
    </>
  );
};

export { DietaryNeedsForm, type DietaryNeedsFormProps };
