/**
 * Detent arithmetic for `Slider`: the coarse stops a below-track drag and the
 * page keys land on. Sorted ascending; callers build them from whatever the
 * value means (pouch fractions, scoops).
 */

export function nearestDetent(
  detents: readonly number[],
  value: number,
): number {
  let best = detents[0];
  for (const detent of detents) {
    if (Math.abs(detent - value) < Math.abs(best - value)) best = detent;
  }
  return best;
}

/** The highest detent strictly below `value`, or null when there is none. */
export function detentBefore(
  detents: readonly number[],
  value: number,
): number | null {
  let best: number | null = null;
  for (const detent of detents) {
    if (detent < value) best = detent;
  }
  return best;
}

/** The lowest detent strictly above `value`, or null when there is none. */
export function detentAfter(
  detents: readonly number[],
  value: number,
): number | null {
  for (const detent of detents) {
    if (detent > value) return detent;
  }
  return null;
}
