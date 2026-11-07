import type { EnergyPlan, WaterPlan } from '../schemas/api/dietaryNeeds.ts';

/**
 * What a new pin gets. Pets are pinned to the plan of the day by an event, so
 * changing these only reaches pets pinned afterwards.
 */
export const DEFAULT_ENERGY_PLAN: EnergyPlan = {
  growth: { maintain: ['fediaf-2025'] },
  adult_neutered: { maintain: ['fediaf-2025'], lose: ['aaha-2021'] },
  adult_intact: { maintain: ['aaha-2021'], lose: ['aaha-2021'] },
};

export const DEFAULT_WATER_PLAN: WaterPlan = {
  normal: ['kosmal-2025'],
  uti_prone: ['kosmal-2025'],
};
