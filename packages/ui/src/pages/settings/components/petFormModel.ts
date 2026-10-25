import { differenceInCalendarMonths, isValid, parseISO } from 'date-fns';
import {
  PET_MICROCHIP_PATTERN,
  type PetAlteredDTO,
  type PetPresenceDTO,
  type PetSexDTO,
  type PutPetPresenceRequestDTO,
} from 'shared';

export type PresenceChoice = 'home' | 'vet' | 'friend' | 'outdoors' | 'other';
export const PRESENCE_CHOICES: readonly PresenceChoice[] = [
  'home',
  'vet',
  'friend',
  'outdoors',
  'other',
];

export const SEX_CHOICES: readonly PetSexDTO[] = ['female', 'male', 'unknown'];
export const ALTERED_CHOICES: readonly PetAlteredDTO[] = [
  'altered',
  'intact',
  'unknown',
];

export const MICROCHIP_PATTERN = new RegExp(PET_MICROCHIP_PATTERN);

/**
 * The select's five choices over the event model's state + context. `travel`
 * predates the select and reads as Other; it is only rewritten when changed.
 */
export function presenceChoiceOf(
  presence: PetPresenceDTO | null | undefined,
): PresenceChoice {
  if (!presence || presence.state === 'home') return 'home';
  if (presence.state === 'outside') return 'outdoors';
  if (presence.context === 'vet') return 'vet';
  if (presence.context === 'friend') return 'friend';
  return 'other';
}

export function presenceForChoice(
  choice: PresenceChoice,
): PutPetPresenceRequestDTO {
  switch (choice) {
    case 'home':
      return { state: 'home' };
    case 'vet':
      return { state: 'away', context: 'vet' };
    case 'friend':
      return { state: 'away', context: 'friend' };
    case 'outdoors':
      return { state: 'outside' };
    case 'other':
      return { state: 'away', context: 'manual' };
  }
}

/** Whole years and leftover months since `birthDate`; null when unknown or in the future. */
export function petAge(
  birthDate: string | null | undefined,
  today: Date,
): { years: number; months: number } | null {
  if (!birthDate) return null;
  const born = parseISO(birthDate);
  if (!isValid(born)) return null;
  let months = differenceInCalendarMonths(today, born);
  if (today.getDate() < born.getDate()) months -= 1;
  if (months < 0) return null;
  return { years: Math.floor(months / 12), months: months % 12 };
}
