import {
  boundsOf,
  type Band,
  type CustomOrigin,
  type GetDietaryNeedsResponse,
  type IntakeGap,
  type PresetOrigin,
} from 'shared';

import type { DietaryNeeds } from '../../services/nutrition/dietaryNeeds.ts';

/** A pet's dietary needs as the API sends them: weights in kg, bounds spelled out. */
export function dietaryNeedsToDto(
  needs: DietaryNeeds,
): GetDietaryNeedsResponse {
  const { targets, food, water } = needs;

  return {
    weight_kg: needs.weightG === null ? null : needs.weightG / 1000,
    target_weight_kg:
      targets.targetWeightG === null ? null : targets.targetWeightG / 1000,
    food: {
      tracked: targets.food.tracked,
      setting: targets.food.setting,
      plan: targets.food.plan,
      ...outcomeToDto(food ?? undefined, bandToDto),
    },
    water: {
      tracked: targets.water.tracked,
      setting: targets.water.setting,
      plan: targets.water.plan,
      ...outcomeToDto(water ?? undefined, bandToDto),
    },
  };
}

/** A band or its gap as the pair of nullable fields the wire uses; both null when nothing resolved. */
function outcomeToDto<Band, Dto>(
  outcome: Band | { gap: IntakeGap } | undefined,
  toDto: (band: Band) => Dto,
): { band: Dto | null; gap: IntakeGap | null } {
  if (outcome === undefined) return { band: null, gap: null };
  if (isGap(outcome)) return { band: null, gap: outcome.gap };
  return { band: toDto(outcome), gap: null };
}

/** Whether an outcome is the reason a preset has no band. */
function isGap<Band>(
  outcome: Band | { gap: IntakeGap },
): outcome is { gap: IntakeGap } {
  return typeof outcome === 'object' && outcome !== null && 'gap' in outcome;
}

/** Where a band's numbers came from, in the wire's field names. */
type OriginDto<Preset, ModelId> =
  | { kind: 'preset'; preset: Preset; model_id: ModelId; ref: string }
  | { kind: 'custom'; source_event_id: number | null };

/** A resolved band with its bounds spelled out, so no client derives them. */
function bandToDto<
  Unit extends string,
  Preset extends string,
  ModelId extends string,
>(
  band: Band & {
    unit: Unit;
    origin: PresetOrigin<Preset, ModelId> | CustomOrigin;
  },
) {
  return {
    target: band.target,
    tolerance: band.tolerance,
    ...boundsOf(band),
    unit: band.unit,
    adjustments: [...band.adjustments],
    origin: originToDto(band.origin),
  };
}

function originToDto<Preset extends string, ModelId extends string>(
  origin: PresetOrigin<Preset, ModelId> | CustomOrigin,
): OriginDto<Preset, ModelId> {
  if (origin.kind === 'custom') {
    return { kind: 'custom', source_event_id: origin.sourceEventId };
  }
  return {
    kind: 'preset',
    preset: origin.preset,
    model_id: origin.modelId,
    ref: origin.ref,
  };
}
