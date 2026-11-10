import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Drumstick, GlassWater, Target } from 'lucide-react';
import {
  ENERGY_MODELS,
  NUTRITION_SOURCES,
  type FoodPreset,
  type GetDietaryNeedsResponse,
  type WaterPreset,
} from 'shared';

import {
  AppHeader,
  AppHeaderBar,
  AppHeaderRow,
} from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import type { Readout } from '@/components/ui/ReadoutGrid';
import { SectionHeader } from '@/components/ui/SectionHeader';
import PetSelector from '@/components/navigation/PetSelector';
import { usePetContext } from '@/hooks/context/usePetContext';
import {
  useFormatters,
  useRegionalPreferences,
} from '@/hooks/context/useRegionalPreferences';
import { usePetDietaryNeeds } from '@/hooks/queries/petQueries';
import { backState } from '@/lib/navigationBack';
import type { TranslationKey } from '@/lib/translationKey';
import { formatCalendarDate } from '@/lib/utils';

import {
  DietaryNeedsSummary,
  type DietaryNeedsCard,
} from './components/DietaryNeedsSummary';
import { draftOf, intakePetFor, waterNotches } from './dietaryNeedsModel';
import './Health.css';

const DIETARY_NEEDS_PATH = '/health/dietary-needs';
const NO_VALUE = '—';

const FOOD_GOAL_KEYS: Record<FoodPreset, TranslationKey> = {
  maintain: 'health.dietary_needs.food_option_maintain',
  lose: 'health.dietary_needs.food_option_lose',
};

const WATER_PROFILE_KEYS: Record<WaterPreset, TranslationKey> = {
  normal: 'health.dietary_needs.water_option_normal',
  uti_prone: 'health.dietary_needs.water_option_uti_prone',
};

type FoodNeeds = GetDietaryNeedsResponse['food'];
type WaterNeeds = GetDietaryNeedsResponse['water'];

/** The band a card leads with, or null while it is not tracked or does not resolve. */
function shownBand<Band>(needs: {
  tracked: boolean;
  band: Band | null;
}): Band | null {
  return needs.tracked ? needs.band : null;
}

/**
 * The Health hub. It shows what is set for the selected pet and leads to
 * where it is edited; what she ate and drank against it is Overview's.
 */
const Health: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedPet } = usePetContext();
  const { timezone } = useRegionalPreferences();
  const { formatNumber } = useFormatters();
  const { data: needs } = usePetDietaryNeeds(selectedPet?.id ?? 0);

  const wayBack = backState('/health', t('navigation.health'));
  const whole = (value: number) =>
    formatNumber(value, { maximumFractionDigits: 0 });
  const range = (low: number, high: number) => `${whole(low)}–${whole(high)}`;

  const foodCard = (food: FoodNeeds): DietaryNeedsCard => {
    const band = shownBand(food);
    const targetWeight = needs?.target_weight_kg ?? null;
    const goal = () => {
      if (!('preset' in food.setting)) {
        return t('health.dietary_needs.option_custom');
      }
      if (food.setting.preset === 'lose' && targetWeight !== null) {
        return t('health.dietary_needs.goal_lose_to', {
          weight: formatNumber(targetWeight, { maximumFractionDigits: 2 }),
        });
      }
      return t(FOOD_GOAL_KEYS[food.setting.preset]);
    };
    const model =
      band?.origin.kind === 'preset'
        ? NUTRITION_SOURCES[ENERGY_MODELS[band.origin.model_id].sourceId].label
        : NO_VALUE;
    const readouts: Readout[] = [
      {
        key: 'goal',
        label: t('health.dietary_needs.readout_label_goal'),
        value: goal(),
      },
      {
        key: 'model',
        label: t('health.dietary_needs.readout_label_model'),
        value: model,
      },
    ];
    return {
      kind: 'food',
      icon: <Drumstick />,
      title: t('health.dietary_needs.food_title'),
      range: band
        ? range(band.lower, band.upper)
        : t('health.dietary_needs.no_band'),
      unit: band ? t('health.dietary_needs.kcal_a_day') : null,
      readouts,
      openLabel: t('health.dietary_needs.edit_food_label'),
    };
  };

  const waterCard = (water: WaterNeeds): DietaryNeedsCard => {
    const band = shownBand(water);
    const profile =
      'preset' in water.setting
        ? t(WATER_PROFILE_KEYS[water.setting.preset])
        : t('health.dietary_needs.option_custom');
    const readouts: Readout[] = [
      {
        key: 'profile',
        label: t('health.dietary_needs.readout_label_profile'),
        value: profile,
      },
      {
        key: 'per_kg',
        label: t('health.dietary_needs.readout_label_per_kg'),
        value: waterPerKg(water),
      },
    ];
    return {
      kind: 'water',
      icon: <GlassWater />,
      title: t('health.dietary_needs.water_title'),
      range: band
        ? range(band.lower, band.upper)
        : t('health.dietary_needs.no_band'),
      unit: band ? t('health.dietary_needs.ml_a_day') : null,
      readouts,
      openLabel: t('health.dietary_needs.edit_water_label'),
    };
  };

  /** The water band per kg as set, which is the figure a source or a vet gives. */
  const waterPerKg = (water: WaterNeeds): string => {
    if (!selectedPet || !needs || needs.weight_kg === null) return NO_VALUE;
    const intakePet = intakePetFor({
      birthDate: selectedPet.birth_date,
      altered: selectedPet.altered,
      weightKg: needs.weight_kg,
      targetWeightKg: needs.target_weight_kg,
      today: formatCalendarDate(new Date(), timezone),
    });
    const perKg = draftOf(water.setting, waterNotches(water.plan, intakePet));
    if (!perKg) return NO_VALUE;
    return t('health.dietary_needs.per_kg_value', {
      low: whole(perKg.target - perKg.tolerance),
      high: whole(perKg.target + perKg.tolerance),
    });
  };

  return (
    <div className="page-health">
      {/* Same chrome as the overview: on a phone the pet strip is the app bar. */}
      <AppHeader>
        <AppHeaderBar
          desktopOnly
          title={
            selectedPet
              ? t('health.title', { pet: selectedPet.name })
              : t('navigation.health')
          }
        />
        <AppHeaderRow>
          <PetSelector variant="mobile" />
        </AppHeaderRow>
      </AppHeader>

      {needs && (
        <div className="health-columns">
          <div className="health-column">
            <section className="health-section">
              <SectionHeader
                icon={<Target />}
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      navigate(DIETARY_NEEDS_PATH, { state: wayBack })
                    }
                  >
                    {t('common.edit')}
                  </Button>
                }
              >
                {t('health.dietary_needs.section_title')}
              </SectionHeader>
              <DietaryNeedsSummary
                cards={[waterCard(needs.water), foodCard(needs.food)]}
                to={DIETARY_NEEDS_PATH}
                state={wayBack}
              />
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

export default Health;
