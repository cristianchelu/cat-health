import type {
  EventAttributionSourceDTO,
  EventCauseDTO,
  EventDataDTO,
} from 'shared';

/**
 * What, if anything, the event surface asks the reader to settle.
 *
 * - `guess` — the machine decided and could be wrong: the band asks once.
 * - `assign` — the machine gave up: the band asks who it was.
 * - `settled` — already answered; a pill in the meta line, never the band again.
 * - `manual` — you logged it, so nothing was guessed: Edit, not Fix.
 * - `none` — hardware knew (a microchip is not a guess), or the event is not
 *   about a pet at all. The absence is the design.
 */
export type EventCorrection =
  | { kind: 'guess' }
  | { kind: 'assign' }
  | { kind: 'settled'; how: 'verified' | 'fixed' }
  | { kind: 'manual' }
  | { kind: 'none' };

/** Sources that are an inference about which animal this was, not a reading of one. */
const GUESS_SOURCES: readonly EventAttributionSourceDTO[] = [
  'weight',
  'recognizer',
];

/**
 * Event kinds that belong to an animal. A connectivity blip or a scoop has no
 * cat to get wrong, so it never grows a correction affordance.
 */
const PET_EVENT_TYPES: readonly EventDataDTO['type'][] = [
  'litterbox_use',
  'water_intake',
  'food_intake',
  'weight_measurement',
  'pet_presence',
];

export interface EventCorrectionInput {
  data: EventDataDTO;
  device_id: number | null;
  caused_by: EventCauseDTO;
  attributed_by: EventAttributionSourceDTO | null;
  human_verified: boolean;
}

/** Whether this kind of event belongs to an animal at all. */
export function isPetEvent(type: EventDataDTO['type']): boolean {
  return PET_EVENT_TYPES.includes(type);
}

export function deriveEventCorrection(
  event: EventCorrectionInput,
): EventCorrection {
  if (!isPetEvent(event.data.type)) return { kind: 'none' };

  // No device produced it, so you did: your data, full edit, no band.
  if (event.device_id == null) return { kind: 'manual' };

  // The matcher ran and came back under threshold. Asking "looks right?" about
  // a blank is the wrong question — the band asks for an assignment instead.
  if (event.caused_by === 'unknown') return { kind: 'assign' };

  // A person settled the attribution: that is a fix, and a fix counts as
  // verification. Both end states are terminal and mutually exclusive.
  if (event.attributed_by === 'manual') {
    return { kind: 'settled', how: 'fixed' };
  }

  const isGuess =
    event.attributed_by != null && GUESS_SOURCES.includes(event.attributed_by);

  if (isGuess) {
    return event.human_verified
      ? { kind: 'settled', how: 'verified' }
      : { kind: 'guess' };
  }

  // `microchip` knows. `null` is history from before attribution was recorded:
  // we cannot claim the machine guessed, so no band — a late correction still
  // reaches the same form through the overflow menu.
  return { kind: 'none' };
}

/**
 * Whether the fix form has anything to offer for this event.
 *
 * A microchip read is the one case with nothing to correct — the hardware
 * named the animal. Everything else about a pet can be re-decided, including
 * the `null`-attribution history the band cannot speak for.
 */
export function canFixEvent(event: EventCorrectionInput): boolean {
  return isPetEvent(event.data.type) && event.attributed_by !== 'microchip';
}

/**
 * Late corrections — after the band was answered, or where it never appeared —
 * go through the overflow menu. While the band or Edit is on screen, the menu
 * would only duplicate them.
 */
export function showsFixInMenu(
  event: EventCorrectionInput,
  correction: EventCorrection,
): boolean {
  return (
    canFixEvent(event) &&
    (correction.kind === 'settled' || correction.kind === 'none')
  );
}
