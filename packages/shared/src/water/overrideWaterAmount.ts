import type { WaterIntakeEventDataDTO } from '../schemas/api/eventData.ts';

/**
 * A person overruling the analyzer's intake: the rest of the draw is spill.
 *
 * `analyzeDrinkingFromSamples` defines the invariant this preserves —
 * `excluded_amount = rawAmount − validAmount` — so a corrected `amount` moves
 * `excluded_amount` with it rather than leaving the split describing a reading
 * that no longer exists. Without a `raw_amount` there is no total to divide,
 * so only the amount itself changes.
 */
export function overrideWaterAmount(
  data: WaterIntakeEventDataDTO,
  amount: number,
): WaterIntakeEventDataDTO {
  if (data.raw_amount == null) {
    return { ...data, amount };
  }
  const excluded = Math.max(0, data.raw_amount - amount);
  return {
    ...data,
    amount,
    excluded_amount: excluded,
    filtered: excluded > 0,
  };
}
