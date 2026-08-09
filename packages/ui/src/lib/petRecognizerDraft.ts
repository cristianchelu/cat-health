import type { PetRecognizerConfig } from 'shared';
import {
  getBooleanValue,
  getNumberValue,
  getStringValue,
  isRecord,
} from '@/lib/utils';

export interface RecognitionDraft {
  autoIdentify: boolean;
  ignoredPets: number[];
  referenceImages: Record<string, number[]>;
}

export type RecognitionGate = 'needs_camera' | 'empty' | 'ready';

function parseNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (
    !value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    return undefined;
  }
  return value as number[];
}

function parseReferenceImages(
  value: unknown,
): Record<string, number[]> | undefined {
  if (value === undefined) return {};
  if (!isRecord(value)) return undefined;
  const result: Record<string, number[]> = {};
  for (const [petId, raw] of Object.entries(value)) {
    const ids = parseNumberArray(raw);
    if (ids === undefined) return undefined;
    result[petId] = ids;
  }
  return result;
}

/**
 * Rebuilds a `PetRecognizerConfig` from an unknown `device.config` payload
 * without ever asserting the shape. Returns `null` on any structural
 * mismatch so callers can render a gate state instead of trusting garbage.
 */
export function parsePetRecognizerConfig(
  config: unknown,
): PetRecognizerConfig | null {
  if (!isRecord(config)) return null;

  const model = getStringValue(config, 'model');
  const sourceDeviceId = getNumberValue(config, 'source_device_id');
  const promptTemplate = getStringValue(config, 'prompt_template');
  const autoIdentify = getBooleanValue(config, 'auto_identify');
  const referenceImages = parseReferenceImages(config.reference_images);

  if (
    model === undefined ||
    sourceDeviceId === undefined ||
    promptTemplate === undefined ||
    autoIdentify === undefined ||
    referenceImages === undefined
  ) {
    return null;
  }

  const result: PetRecognizerConfig = {
    model,
    source_device_id: sourceDeviceId,
    prompt_template: promptTemplate,
    auto_identify: autoIdentify,
    reference_images: referenceImages,
  };

  if (config.ignored_pets !== undefined) {
    const ignoredPets = parseNumberArray(config.ignored_pets);
    if (ignoredPets === undefined) return null;
    result.ignored_pets = ignoredPets;
  }

  return result;
}

export function isPetWatched(
  ignoredPets: readonly number[] | undefined,
  petId: number,
): boolean {
  return !(ignoredPets ?? []).includes(petId);
}

/**
 * Returns the next `ignored_pets` denylist for a single pet's watch toggle.
 * Omitting an emptied list from persistence is buildRecognizerConfigPatch's
 * job, not this function's.
 */
export function setPetWatched(
  ignoredPets: readonly number[] | undefined,
  petId: number,
  watched: boolean,
): number[] {
  const next = new Set(ignoredPets ?? []);
  if (watched) next.delete(petId);
  else next.add(petId);
  return [...next].sort((a, b) => a - b);
}

export function draftFromRecognizerConfig(
  config: PetRecognizerConfig,
): RecognitionDraft {
  const referenceImages: Record<string, number[]> = {};
  for (const [petId, ids] of Object.entries(config.reference_images)) {
    referenceImages[petId] = [...ids];
  }
  return {
    autoIdentify: config.auto_identify,
    ignoredPets: [...(config.ignored_pets ?? [])].sort((a, b) => a - b),
    referenceImages,
  };
}

function numberArraysEqualUnordered(
  a: readonly number[],
  b: readonly number[],
): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((value, index) => value === sortedB[index]);
}

function referenceImagesEqual(
  a: Record<string, number[]>,
  b: Record<string, number[]>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => {
    const idsB = b[key];
    if (idsB === undefined) return false;
    return numberArraysEqualUnordered(a[key] ?? [], idsB);
  });
}

export function recognitionDraftEqual(
  a: RecognitionDraft,
  b: RecognitionDraft,
): boolean {
  if (a.autoIdentify !== b.autoIdentify) return false;
  if (!numberArraysEqualUnordered(a.ignoredPets, b.ignoredPets)) return false;
  return referenceImagesEqual(a.referenceImages, b.referenceImages);
}

/**
 * Preserves model, source_device_id and prompt_template from the baseline
 * (this tab never edits them) and applies the draft's editable fields.
 * Pets whose reference list was emptied are dropped from `reference_images`
 * so the config never carries `{'1': []}` entries forward.
 */
export function buildRecognizerConfigPatch(
  baseline: PetRecognizerConfig,
  draft: RecognitionDraft,
): PetRecognizerConfig {
  const referenceImages: Record<string, number[]> = {};
  for (const [petId, ids] of Object.entries(draft.referenceImages)) {
    if (ids.length > 0) referenceImages[petId] = [...ids];
  }

  const result: PetRecognizerConfig = {
    model: baseline.model,
    source_device_id: baseline.source_device_id,
    prompt_template: baseline.prompt_template,
    auto_identify: draft.autoIdentify,
    reference_images: referenceImages,
  };

  if (draft.ignoredPets.length > 0) {
    result.ignored_pets = [...draft.ignoredPets].sort((a, b) => a - b);
  }

  return result;
}

/**
 * A camera link is the hard gate: without a source there is nothing to
 * recognize. `recognizerCount` is every recognizer in the account — linked
 * to this device or not — because assigning an existing recognizer happens
 * inside the ready state; only an account with no recognizers at all is
 * 'empty'. A missing inference provider is a secondary hint the View
 * renders alongside the locked state, not a distinct gate here.
 */
export function resolveRecognitionGate(args: {
  hasCameraLink: boolean;
  recognizerCount: number;
}): RecognitionGate {
  if (!args.hasCameraLink) return 'needs_camera';
  if (args.recognizerCount === 0) return 'empty';
  return 'ready';
}

/**
 * Appends reference ids for a pet, preserving order while dropping ids the
 * pet already has and duplicates within the incoming batch. Returns the
 * draft untouched when nothing new remains, so no key is materialized for
 * an all-duplicate (or empty) batch.
 */
export function addDraftReferenceImages(
  draft: RecognitionDraft,
  petId: number,
  mediaIds: readonly number[],
): RecognitionDraft {
  const key = String(petId);
  const current = draft.referenceImages[key] ?? [];
  const seen = new Set(current);
  const appended: number[] = [];
  for (const id of mediaIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    appended.push(id);
  }
  if (appended.length === 0) return draft;
  return {
    ...draft,
    referenceImages: {
      ...draft.referenceImages,
      [key]: [...current, ...appended],
    },
  };
}

/**
 * Removes one reference id from a pet's list. A pet with no entry is left
 * untouched — materializing an empty key would make an otherwise unchanged
 * draft compare dirty, since draft equality counts keys.
 */
export function removeDraftReferenceImage(
  draft: RecognitionDraft,
  petId: number,
  mediaId: number,
): RecognitionDraft {
  const key = String(petId);
  const current = draft.referenceImages[key];
  if (current === undefined) return draft;
  return {
    ...draft,
    referenceImages: {
      ...draft.referenceImages,
      [key]: current.filter((id) => id !== mediaId),
    },
  };
}
