import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { GlassWater } from 'lucide-react';
import {
  WATER_MODELS,
  boundsOf,
  resolveWaterBand,
  type GetDietaryNeedsResponse,
  type GetPetResponseDTO,
  type PutDietaryNeedsRequest,
  type WaterPreset,
} from 'shared';

import type { LabelValueRow } from '@/components/ui/LabelValueRows';
import { useFormatters } from '@/hooks/context/useRegionalPreferences';
import { useDraftForm } from '@/hooks/form';
import type { TranslationKey } from '@/lib/translationKey';

import {
  WATER_SCALE,
  draftOf,
  holding,
  intakePetFor,
  presetAt,
  waterChange,
  waterDraftFromNeeds,
  waterNotches,
  waterSettingOf,
  withTarget,
  withTolerance,
  type BandDraft,
} from '../dietaryNeedsModel';
import { BandCitation } from './BandCitation';
import { BandSheet } from './BandSheet';
import { GAP_KEYS } from './gapKeys';
import { IntakeBandEditor } from './IntakeBandEditor';
import './WaterBandSheet.css';

/** The name of each water notch. */
const WATER_OPTION_KEYS: Record<WaterPreset, TranslationKey> = {
  normal: 'health.dietary_needs.water_option_normal',
  uti_prone: 'health.dietary_needs.water_option_uti_prone',
};

interface WaterBandSheetProps {
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
 * The water band's editor: its draft, the notches and band it resolves to as
 * it changes, and the copy. The band is edited per kg, the figure a source or
 * a vet gives.
 */
const WaterBandSheet: React.FC<WaterBandSheetProps> = ({
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

  const baseline = React.useMemo(() => waterDraftFromNeeds(needs), [needs]);
  const { draft, patchDraft, isDirty, commit, requestDiscard, discardConfirm } =
    useDraftForm(baseline, { baselineKey: JSON.stringify(baseline) });

  const save = async () => {
    const saved = await onSave(waterChange(draft));
    if (!saved) return;
    commit();
    onClose();
  };

  const editor = () => {
    const weightKg = needs.weight_kg;
    if (weightKg === null) {
      return (
        <p className="water-band-sheet-notice">
          {t('health.dietary_needs.never_weighed', { pet: pet.name })}
        </p>
      );
    }

    const intakePet = intakePetFor({
      birthDate: pet.birth_date,
      altered: pet.altered,
      weightKg,
      targetWeightKg: needs.target_weight_kg,
      today,
    });
    const plan = needs.water.plan;
    const stops = waterNotches(plan, intakePet);
    const band = draftOf(draft.setting, stops);
    const track = holding(WATER_SCALE, band);
    const resolved = resolveWaterBand(draft.setting, plan, intakePet);
    const setBand = (next: BandDraft) =>
      patchDraft({ setting: waterSettingOf(next, stops) });

    const whole = (value: number) =>
      formatNumber(value, { maximumFractionDigits: 0 });

    const rows: LabelValueRow[] = [];
    if (!('gap' in resolved)) {
      const { lower, upper } = boundsOf(resolved);
      rows.push({
        key: 'band',
        label: t('health.dietary_needs.row_label_band', {
          pet: pet.name,
          weight: formatNumber(weightKg, { maximumFractionDigits: 2 }),
        }),
        value: t('health.dietary_needs.ml_range_a_day', {
          low: whole(lower),
          high: whole(upper),
        }),
      });
    }

    const citation =
      !('gap' in resolved) && resolved.origin.kind === 'preset' ? (
        <BandCitation
          sourceId={WATER_MODELS[resolved.origin.modelId].sourceId}
          reference={resolved.origin.ref}
          adjustments={resolved.adjustments}
        />
      ) : undefined;

    return (
      <IntakeBandEditor
        band={band}
        noBandNotice={'gap' in resolved ? t(GAP_KEYS[resolved.gap]) : ''}
        unit={t('health.dietary_needs.unit_ml_per_kg')}
        note={
          'gap' in resolved
            ? ''
            : t('health.dietary_needs.water_note', {
                amount: whole(resolved.target),
              })
        }
        hint={citation}
        scale={track}
        notches={stops.map((stop) => ({
          key: stop.preset,
          value: stop.target,
          label: t(WATER_OPTION_KEYS[stop.preset]),
        }))}
        activeNotch={band ? presetAt(band, stops) : null}
        onTargetChange={(target) => {
          if (band) setBand(withTarget(band, target, track, 0));
        }}
        onToleranceChange={(tolerance) => {
          if (band) setBand(withTolerance(band, tolerance, 0));
        }}
        onNotchSelect={(key) => {
          const stop = stops.find((s) => s.preset === key);
          if (stop) patchDraft({ setting: { preset: stop.preset } });
        }}
        targetLabel={t('health.dietary_needs.target_label')}
        toleranceLabel={t('health.dietary_needs.tolerance_label')}
        rows={rows}
      />
    );
  };

  return (
    <BandSheet
      open={open}
      onRequestClose={() => requestDiscard(onClose)}
      canDismiss={!isDirty}
      icon={<GlassWater />}
      title={t('health.dietary_needs.water_title')}
      tracked={draft.tracked}
      onTrackedChange={(tracked) => patchDraft({ tracked })}
      trackedLabel={t('health.dietary_needs.tracked')}
      untrackedLabel={t('health.dietary_needs.not_tracked')}
      trackSwitchLabel={t('health.dietary_needs.track_water_label')}
      error={error}
      discard={discardConfirm}
      keepLabel={t('common.keep_editing')}
      discardLabel={t('common.discard')}
      cancelLabel={t('common.cancel')}
      saveLabel={t('common.save')}
      onSave={() => void save()}
      isSaving={isSaving}
      saveDisabled={!isDirty}
    >
      <div className="water-band-sheet">{editor()}</div>
    </BandSheet>
  );
};

export { WaterBandSheet, type WaterBandSheetProps };
