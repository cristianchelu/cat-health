import type { TFunction } from 'i18next';
import {
  SUREPET_BOWL_TYPE_LARGE,
  SUREPET_BOWL_TYPE_TWO_SMALL,
  surePetFoodTypeHint,
} from './surePetConstants';

const TRAINING_MODE_KEYS: Record<number, string> = {
  0: 'training_mode_off',
  1: 'training_mode_step_1',
  2: 'training_mode_step_2',
  3: 'training_mode_step_3',
  4: 'training_mode_step_4',
};

const CLOSE_DELAY_KEYS: Record<number, string> = {
  0: 'lid_close_faster',
  4: 'lid_close_normal',
  20: 'lid_close_slower',
};

export function formatTrainingMode(value: number, t: TFunction): string {
  const key = TRAINING_MODE_KEYS[value];
  if (key) {
    return t(`devices.feeder.${key}`);
  }
  return t('devices.feeder.training_mode_unknown', { value });
}

export function formatCloseDelay(value: number, t: TFunction): string {
  const key = CLOSE_DELAY_KEYS[value];
  if (key) {
    return t(`devices.feeder.${key}`);
  }
  return t('devices.feeder.lid_close_seconds', { seconds: value });
}

export function getBowlLabel(
  bowl: { position?: number },
  index: number,
  bowlType: number | undefined,
  t: TFunction,
): string {
  if (bowlType === SUREPET_BOWL_TYPE_LARGE) {
    return t('devices.feeder.bowl_single');
  }
  if (bowlType === SUREPET_BOWL_TYPE_TWO_SMALL) {
    const position = bowl.position ?? index;
    if (position === 0) {
      return t('devices.feeder.bowl_left');
    }
    if (position === 1) {
      return t('devices.feeder.bowl_right');
    }
  }
  return t('devices.feeder.bowl_label', { number: index + 1 });
}

export function formatFoodTypeSubtitle(
  foodType: number | undefined,
  t: TFunction,
): string | undefined {
  const hint = surePetFoodTypeHint(foodType);
  if (hint === 'wet') return t('devices.feeder.food_wet');
  if (hint === 'dry') return t('devices.feeder.food_dry');
  return undefined;
}
