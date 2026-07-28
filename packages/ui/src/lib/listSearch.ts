/**
 * Client-side text matching for settings listings.
 *
 * Lists here are household-sized (a handful of devices, providers, pets), so
 * filtering happens over the already-cached query data rather than round-
 * tripping to the API for a search endpoint nobody needs.
 */

/**
 * Fold a string down to something typeable: lowercase, no diacritics, single
 * spaces.
 *
 * Romanian names carry ă/î/â/ș/ț, and the people using this app type on
 * whatever keyboard is in front of them. Searching "pisica" has to find
 * "Pisică", and pasting "Pisică" has to find a row stored without the marks.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Does a row match what someone typed?
 *
 * Every whitespace-separated term must appear somewhere in `fields`, but each
 * term is free to land in a different one — "pura petkit" narrows to the PetKit
 * litter box even though no single field holds both words. A blank query
 * matches everything, so callers can pass the raw input straight through.
 *
 * Each field is searchable with and without its spaces, because brand names are
 * written both ways and nobody remembers which: "Sure Petcare" has to be
 * findable by typing `surepet`, and "Water Fountain" by `waterfountain`.
 */
export function matchesSearchQuery(
  query: string,
  fields: ReadonlyArray<string | null | undefined>,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystack = fields
    .filter((field): field is string => Boolean(field))
    .flatMap((field) => {
      const normalized = normalizeSearchText(field);
      const spaceless = normalized.replace(/ /g, '');
      return spaceless === normalized ? [normalized] : [normalized, spaceless];
    });

  return normalizedQuery
    .split(' ')
    .every((term) => haystack.some((field) => field.includes(term)));
}
