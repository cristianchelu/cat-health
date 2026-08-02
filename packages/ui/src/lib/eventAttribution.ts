import { NON_PET_CAUSES } from 'shared';
import type {
  EventCauseDTO,
  PatchEventRequestDTO,
  EventAttributionSourceDTO,
} from 'shared';

/**
 * The attribution picker offers one flat list — unresolved, each pet, then each
 * non-pet cause — encoded as a single `<select>` string.
 *
 * Pet ids are prefixed rather than left bare so a pet can never collide with a
 * cause token, however the two vocabularies grow.
 */
const PET_PREFIX = 'pet:';

export interface EventAttribution {
  petId: number | null;
  causedBy: EventCauseDTO;
}

export function attributionFromEvent(event: {
  pet_id: number | null;
  caused_by: EventCauseDTO;
}): EventAttribution {
  return { petId: event.pet_id, causedBy: event.caused_by };
}

export function attributionSelectValue(attribution: EventAttribution): string {
  if (attribution.causedBy === 'pet' && attribution.petId != null) {
    return `${PET_PREFIX}${attribution.petId}`;
  }
  return attribution.causedBy;
}

export function attributionFromSelectValue(value: string): EventAttribution {
  if (value.startsWith(PET_PREFIX)) {
    const parsed = Number.parseInt(value.slice(PET_PREFIX.length), 10);
    return Number.isInteger(parsed) && parsed >= 1
      ? { petId: parsed, causedBy: 'pet' }
      : { petId: null, causedBy: 'unknown' };
  }
  const cause = ([...NON_PET_CAUSES, 'pet', 'unknown'] as const).find(
    (c) => c === value,
  );
  return cause ? { petId: null, causedBy: cause } : { petId: null, causedBy: 'unknown' };
}

/** Both fields together — the server rejects a pet_id under a non-pet cause. */
export function attributionToPatch(
  attribution: EventAttribution,
): Pick<PatchEventRequestDTO, 'pet_id' | 'caused_by'> {
  return { pet_id: attribution.petId, caused_by: attribution.causedBy };
}

export interface AttributionOptionLabels {
  unknown: string;
  cause: (cause: EventCauseDTO) => string;
}

/**
 * Unresolved first — it is the default and the one people clear away — then the
 * pets, then the non-pet causes. `pet` itself is not offered: choosing "a pet
 * but I can't say which" over "unresolved" is a distinction the API supports but
 * nobody has asked to make by hand.
 */
export function attributionSelectOptions(
  pets: Array<{ id: number; name: string }> | undefined,
  labels: AttributionOptionLabels,
): Array<{ value: string; label: string }> {
  return [
    { value: 'unknown', label: labels.unknown },
    ...(pets ?? []).map((p) => ({
      value: `${PET_PREFIX}${p.id}`,
      label: p.name,
    })),
    ...NON_PET_CAUSES.map((cause) => ({
      value: cause,
      label: labels.cause(cause),
    })),
  ];
}

/** i18n key for a cause, e.g. `event_attribution.cause_robot_vacuum`. */
export function causeLabelKey(cause: EventCauseDTO): string {
  return `event_attribution.cause_${cause}`;
}

/** i18n key for a source, e.g. `event_attribution.source_microchip`. */
export function sourceLabelKey(source: EventAttributionSourceDTO): string {
  return `event_attribution.source_${source}`;
}
