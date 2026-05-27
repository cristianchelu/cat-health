import type { SurePetBowlSetting, SurePetBowlStatus } from 'shared';
import { BowlPosition, BowlType, FoodType } from './constants.ts';
import type { SurePetDeviceDetailPayload } from './types.ts';

/** py-surepetcare `BowlTypeOptions` name → (bowl type, food types per slot). */
const BOWL_TYPE_OPTIONS: Array<{
  name: string;
  bowlType: number;
  foodTypes: number[];
}> = [
  { name: 'LARGE_WET', bowlType: BowlType.LARGE, foodTypes: [FoodType.WET] },
  { name: 'LARGE_DRY', bowlType: BowlType.LARGE, foodTypes: [FoodType.DRY] },
  {
    name: 'TWO_SMALL_WET_WET',
    bowlType: BowlType.TWO_SMALL,
    foodTypes: [FoodType.WET, FoodType.WET],
  },
  {
    name: 'TWO_SMALL_WET_DRY',
    bowlType: BowlType.TWO_SMALL,
    foodTypes: [FoodType.WET, FoodType.DRY],
  },
  {
    name: 'TWO_SMALL_DRY_WET',
    bowlType: BowlType.TWO_SMALL,
    foodTypes: [FoodType.DRY, FoodType.WET],
  },
  {
    name: 'TWO_SMALL_DRY_DRY',
    bowlType: BowlType.TWO_SMALL,
    foodTypes: [FoodType.DRY, FoodType.DRY],
  },
];

export interface NormalizedFeederBowls {
  bowlStatus: SurePetBowlStatus[];
  bowlSettings: SurePetBowlSetting[];
  bowlType?: number;
  bowlTypeLabel?: string;
}

function normalizeSettings(
  settings: Array<{ food_type?: number | null; target?: number | null } | null> | null | undefined,
): SurePetBowlSetting[] {
  if (!settings?.length) return [];
  return settings.map((setting) => ({
    food_type: setting?.food_type ?? undefined,
    target: setting?.target ?? undefined,
  }));
}

function resolveBowlTypeLabel(
  bowlType: number | undefined,
  settings: SurePetBowlSetting[],
): string | undefined {
  if (bowlType == null || settings.length === 0) return undefined;

  const foodTypes = settings.map((s) => s.food_type ?? null);
  for (const option of BOWL_TYPE_OPTIONS) {
    if (option.bowlType !== bowlType) continue;
    if (option.foodTypes.length !== foodTypes.length) continue;
    const matches = option.foodTypes.every(
      (ft, i) => ft === foodTypes[i],
    );
    if (matches) return option.name;
  }
  return undefined;
}

export function normalizeFeederBowls(
  payload: SurePetDeviceDetailPayload,
): NormalizedFeederBowls {
  const bowlsControl = payload.control?.bowls;
  const bowlType = bowlsControl?.type ?? undefined;
  const bowlSettings = normalizeSettings(bowlsControl?.settings ?? undefined);

  let rawStatus = payload.status?.bowl_status ?? [];

  let bowlStatus: SurePetBowlStatus[];

  if (bowlType === BowlType.LARGE && rawStatus.length > 0) {
    const first = rawStatus[0];
    bowlStatus = [
      {
        position: BowlPosition.BOTH,
        current_weight: first?.current_weight ?? undefined,
        food_type: bowlSettings[0]?.food_type,
      },
    ];
  } else {
    bowlStatus = rawStatus.map((bowl, index) => ({
      position: bowl.position ?? undefined,
      current_weight: bowl.current_weight ?? undefined,
      food_type: bowlSettings[index]?.food_type,
    }));
  }

  const bowlTypeLabel = resolveBowlTypeLabel(bowlType, bowlSettings);

  return {
    bowlStatus,
    bowlSettings,
    bowlType,
    bowlTypeLabel,
  };
}
