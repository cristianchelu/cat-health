/**
 * Sort direction for the settings listings.
 *
 * Comparators here are written ascending and multiplied by a sign, so exactly
 * one line in a sort function knows which way round the list goes.
 */

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** The other direction — what a direction toggle switches to. */
export function toggleSortDirection(direction: SortDirection): SortDirection {
  return direction === 'asc' ? 'desc' : 'asc';
}

/** Multiplier that turns an ascending comparison into the wanted direction. */
export function sortDirectionSign(direction: SortDirection): 1 | -1 {
  return direction === 'asc' ? 1 : -1;
}
