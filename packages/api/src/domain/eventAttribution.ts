import type { EventAttributionSourceDTO, EventCauseDTO } from 'shared';

/**
 * Attribution: what caused an event, and how we know.
 *
 * `pet_id` and `caused_by` are one decision in two columns, so everything that
 * writes them goes through here. That keeps the invariant the DB CHECK enforces
 * — a `pet_id` only ever alongside `caused_by = 'pet'` — expressed once, and
 * means no caller can leave the pair half-updated.
 *
 * Adding a cause or a source is a literal in the shared TypeBox schema plus,
 * where it matters, a case here. Deliberately no DDL: the database constrains
 * the relationship between the columns, never the vocabulary in them.
 */
export interface EventAttributionColumns {
  pet_id: number | null;
  caused_by: EventCauseDTO;
  attributed_by: EventAttributionSourceDTO | null;
}

/** A cause is settled once anything but `unknown` has been decided. */
export function isResolvedCause(cause: EventCauseDTO): boolean {
  return cause !== 'unknown';
}

/** True when the event is attributed to no pet of ours. */
export function isNonPetCause(cause: EventCauseDTO): boolean {
  return cause !== 'unknown' && cause !== 'pet';
}

/**
 * Build the column trio for a decision something just made.
 *
 * A non-pet cause drops any `pet_id` rather than trusting the caller to pass
 * null alongside it — that pairing is the one thing the CHECK rejects, and a
 * writer should not be able to trip it by omission.
 */
export function attributionColumns(
  cause: EventCauseDTO,
  petId: number | null,
  source: EventAttributionSourceDTO | null,
): EventAttributionColumns {
  return {
    pet_id: cause === 'pet' ? petId : null,
    caused_by: cause,
    attributed_by: source,
  };
}

/**
 * Request body → columns.
 *
 * Returns `undefined` when the caller said nothing about attribution (leave the
 * columns alone) and `'invalid'` when the body contradicts itself, which the
 * routes turn into a 400 rather than silently picking a winner.
 *
 * A `pet_id` on its own means `pet` — clients that predate `caused_by` keep
 * working. Sending both is only an error when they disagree; agreeing is how
 * the UI submits, since it always sends the full decision.
 */
export function attributionColumnsFromRequest(input: {
  pet_id?: number | null;
  caused_by?: EventCauseDTO;
  attributed_by?: EventAttributionSourceDTO;
  /** Applied when the body settles a cause without naming a source. */
  defaultSource?: EventAttributionSourceDTO;
}): EventAttributionColumns | 'invalid' | undefined {
  const { pet_id, caused_by, attributed_by, defaultSource } = input;

  if (pet_id === undefined && caused_by === undefined) {
    // `attributed_by` alone says how we know something the caller isn't
    // restating; there is no decision here to normalise.
    return undefined;
  }

  // Only a real pet row id counts. 0 / NaN / negatives are not pets and must
  // never reach the foreign key, so they read as "no pet named".
  const namedPet =
    typeof pet_id === 'number' && Number.isInteger(pet_id) && pet_id >= 1
      ? pet_id
      : null;

  if (caused_by !== undefined && namedPet !== null && caused_by !== 'pet') {
    return 'invalid';
  }
  if (caused_by === 'pet' && namedPet === null && pet_id !== undefined) {
    // Explicitly `pet` with an explicitly absent pet is the "a pet, but which?"
    // state — legitimate, and distinct from the contradiction above.
    return {
      pet_id: null,
      caused_by: 'pet',
      attributed_by: attributed_by ?? defaultSource ?? null,
    };
  }

  const cause: EventCauseDTO =
    caused_by ?? (namedPet !== null ? 'pet' : 'unknown');
  const source =
    attributed_by ?? (isResolvedCause(cause) ? defaultSource : undefined);

  return attributionColumns(cause, namedPet, source ?? null);
}
