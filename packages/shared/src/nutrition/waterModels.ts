import type { NutritionSourceId } from './sources.ts';

export const WATER_PRESETS = ['normal', 'uti_prone'] as const;
export type WaterPreset = (typeof WATER_PRESETS)[number];

/** ml per kg of body weight a day, total water (food moisture included). */
export interface WaterAim {
  target: number;
  tolerance: number;
}

export interface WaterModel {
  sourceId: NutritionSourceId;
  /** Every number comes from `sourceId`; a preset it does not give is null. */
  aim(preset: WaterPreset): WaterAim | null;
}

const kosmal2025: WaterModel = {
  sourceId: 'kosmal-2025',
  aim(preset) {
    // The abstract's ranges: 23–51 for healthy cats, 42–51 with USG below 1.035.
    if (preset === 'normal') return { target: 37, tolerance: 14 };
    return { target: 46.5, tolerance: 4.5 };
  },
};

/** Append-only: stored plans name these ids, so none is ever removed or reused. */
export const WATER_MODEL_IDS = ['kosmal-2025'] as const;
export type WaterModelId = (typeof WATER_MODEL_IDS)[number];

export const WATER_MODELS: Record<WaterModelId, WaterModel> = {
  'kosmal-2025': kosmal2025,
};
