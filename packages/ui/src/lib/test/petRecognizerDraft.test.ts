import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PetRecognizerConfig } from 'shared';

import {
  addDraftReferenceImages,
  buildRecognizerConfigPatch,
  draftFromRecognizerConfig,
  isPetWatched,
  parsePetRecognizerConfig,
  recognitionDraftEqual,
  removeDraftReferenceImage,
  resolveRecognitionGate,
  setPetWatched,
  type RecognitionDraft,
} from '../petRecognizerDraft.ts';

function config(
  overrides: Partial<PetRecognizerConfig> = {},
): PetRecognizerConfig {
  return {
    model: 'gpt-4o-mini',
    source_device_id: 7,
    prompt_template: 'Identify the cat in this photo.',
    auto_identify: true,
    reference_images: { '1': [10, 11] },
    ...overrides,
  };
}

function draft(overrides: Partial<RecognitionDraft> = {}): RecognitionDraft {
  return {
    autoIdentify: true,
    ignoredPets: [],
    referenceImages: { '1': [10, 11] },
    ...overrides,
  };
}

describe('parsePetRecognizerConfig', () => {
  it('returns null for non-record input', () => {
    assert.equal(parsePetRecognizerConfig(null), null);
    assert.equal(parsePetRecognizerConfig(undefined), null);
    assert.equal(parsePetRecognizerConfig('nope'), null);
    assert.equal(parsePetRecognizerConfig(42), null);
    assert.equal(parsePetRecognizerConfig([1, 2]), null);
  });

  it('returns null when model is missing', () => {
    const raw: Record<string, unknown> = config();
    delete raw.model;
    assert.equal(parsePetRecognizerConfig(raw), null);
  });

  it('returns null when source_device_id is missing or not a number', () => {
    const raw: Record<string, unknown> = config();
    delete raw.source_device_id;
    assert.equal(parsePetRecognizerConfig(raw), null);
    assert.equal(
      parsePetRecognizerConfig({ ...config(), source_device_id: '7' }),
      null,
    );
  });

  it('returns null when prompt_template is missing', () => {
    const raw: Record<string, unknown> = config();
    delete raw.prompt_template;
    assert.equal(parsePetRecognizerConfig(raw), null);
  });

  it('returns null when auto_identify is missing or not a boolean', () => {
    const raw: Record<string, unknown> = config();
    delete raw.auto_identify;
    assert.equal(parsePetRecognizerConfig(raw), null);
    assert.equal(
      parsePetRecognizerConfig({ ...config(), auto_identify: 'yes' }),
      null,
    );
  });

  it('defaults reference_images to {} when absent', () => {
    const raw: Record<string, unknown> = config();
    delete raw.reference_images;
    assert.deepEqual(parsePetRecognizerConfig(raw), {
      ...config(),
      reference_images: {},
    });
  });

  it('returns null when reference_images has a non-number-array value', () => {
    assert.equal(
      parsePetRecognizerConfig({
        ...config(),
        reference_images: { '1': ['not-a-number'] },
      }),
      null,
    );
    assert.equal(
      parsePetRecognizerConfig({
        ...config(),
        reference_images: 'nope',
      }),
      null,
    );
  });

  it('carries through a valid ignored_pets array', () => {
    const parsed = parsePetRecognizerConfig(config({ ignored_pets: [3, 4] }));
    assert.deepEqual(parsed?.ignored_pets, [3, 4]);
  });

  it('omits ignored_pets when absent from input', () => {
    const parsed = parsePetRecognizerConfig(config());
    assert.equal(parsed?.ignored_pets, undefined);
  });

  it('returns null when ignored_pets contains a non-number', () => {
    assert.equal(
      parsePetRecognizerConfig({ ...config(), ignored_pets: [1, 'x'] }),
      null,
    );
  });

  it('ignores extraneous properties on the input record', () => {
    const parsed = parsePetRecognizerConfig({
      ...config(),
      unrelated_field: 'whatever',
    });
    assert.deepEqual(parsed, config());
  });
});

describe('isPetWatched', () => {
  it('is true when ignoredPets is undefined', () => {
    assert.equal(isPetWatched(undefined, 1), true);
  });

  it('is true when petId is not in ignoredPets', () => {
    assert.equal(isPetWatched([2, 3], 1), true);
  });

  it('is false when petId is in ignoredPets', () => {
    assert.equal(isPetWatched([1, 2], 1), false);
  });
});

describe('setPetWatched', () => {
  it('adds petId to an undefined ignored list when marking unwatched', () => {
    assert.deepEqual(setPetWatched(undefined, 5, false), [5]);
  });

  it('adds petId to an existing ignored list, sorted', () => {
    assert.deepEqual(setPetWatched([1, 9], 5, false), [1, 5, 9]);
  });

  it('is idempotent when already ignored and marked unwatched again', () => {
    assert.deepEqual(setPetWatched([5], 5, false), [5]);
  });

  it('removes petId when marking watched', () => {
    assert.deepEqual(setPetWatched([1, 5, 9], 5, true), [1, 9]);
  });

  it('returns an empty list when the last ignored pet is watched again', () => {
    assert.deepEqual(setPetWatched([5], 5, true), []);
    assert.deepEqual(setPetWatched(undefined, 5, true), []);
  });

  it('does not mutate the input array', () => {
    const input = [1, 2];
    setPetWatched(input, 3, false);
    assert.deepEqual(input, [1, 2]);
  });
});

describe('draftFromRecognizerConfig', () => {
  it('maps auto_identify and reference_images verbatim', () => {
    const result = draftFromRecognizerConfig(config());
    assert.equal(result.autoIdentify, true);
    assert.deepEqual(result.referenceImages, { '1': [10, 11] });
  });

  it('defaults ignoredPets to [] when config has no ignored_pets', () => {
    const result = draftFromRecognizerConfig(config());
    assert.deepEqual(result.ignoredPets, []);
  });

  it('sorts ignoredPets ascending', () => {
    const result = draftFromRecognizerConfig(
      config({ ignored_pets: [9, 1, 5] }),
    );
    assert.deepEqual(result.ignoredPets, [1, 5, 9]);
  });

  it('deep-clones reference_images so mutating the draft cannot affect the source config', () => {
    const source = config();
    const result = draftFromRecognizerConfig(source);
    result.referenceImages['1']?.push(999);
    assert.deepEqual(source.reference_images['1'], [10, 11]);
  });
});

describe('recognitionDraftEqual', () => {
  it('is true for two drafts with identical values', () => {
    assert.equal(recognitionDraftEqual(draft(), draft()), true);
  });

  it('is false when autoIdentify differs', () => {
    assert.equal(
      recognitionDraftEqual(
        draft({ autoIdentify: true }),
        draft({ autoIdentify: false }),
      ),
      false,
    );
  });

  it('is false when ignoredPets differ in content', () => {
    assert.equal(
      recognitionDraftEqual(
        draft({ ignoredPets: [1] }),
        draft({ ignoredPets: [2] }),
      ),
      false,
    );
  });

  it('is true when ignoredPets have same content in a different order', () => {
    assert.equal(
      recognitionDraftEqual(
        draft({ ignoredPets: [1, 2] }),
        draft({ ignoredPets: [2, 1] }),
      ),
      true,
    );
  });

  it('is false when referenceImages differ per pet', () => {
    assert.equal(
      recognitionDraftEqual(
        draft({ referenceImages: { '1': [10] } }),
        draft({ referenceImages: { '1': [10, 11] } }),
      ),
      false,
    );
  });

  it('is false when referenceImages have different pet keys', () => {
    assert.equal(
      recognitionDraftEqual(
        draft({ referenceImages: { '1': [10] } }),
        draft({ referenceImages: { '1': [10], '2': [20] } }),
      ),
      false,
    );
  });
});

describe('buildRecognizerConfigPatch', () => {
  it('preserves model, source_device_id and prompt_template from baseline', () => {
    const patch = buildRecognizerConfigPatch(config(), draft());
    assert.equal(patch.model, config().model);
    assert.equal(patch.source_device_id, config().source_device_id);
    assert.equal(patch.prompt_template, config().prompt_template);
  });

  it('applies draft auto_identify and reference_images', () => {
    const patch = buildRecognizerConfigPatch(
      config(),
      draft({ autoIdentify: false, referenceImages: { '2': [20] } }),
    );
    assert.equal(patch.auto_identify, false);
    assert.deepEqual(patch.reference_images, { '2': [20] });
  });

  it('omits ignored_pets when draft.ignoredPets is empty', () => {
    const patch = buildRecognizerConfigPatch(
      config(),
      draft({ ignoredPets: [] }),
    );
    assert.equal(patch.ignored_pets, undefined);
  });

  it('includes sorted ignored_pets when draft.ignoredPets is non-empty', () => {
    const patch = buildRecognizerConfigPatch(
      config(),
      draft({ ignoredPets: [9, 1] }),
    );
    assert.deepEqual(patch.ignored_pets, [1, 9]);
  });

  it('drops reference_images keys whose list was emptied', () => {
    const patch = buildRecognizerConfigPatch(
      config(),
      draft({ referenceImages: { '1': [] } }),
    );
    assert.deepEqual(patch.reference_images, {});
  });

  it('keeps non-empty reference_images keys while dropping emptied ones', () => {
    const patch = buildRecognizerConfigPatch(
      config(),
      draft({ referenceImages: { '1': [], '2': [20] } }),
    );
    assert.deepEqual(patch.reference_images, { '2': [20] });
  });
});

describe('resolveRecognitionGate', () => {
  it('is needs_camera when there is no camera link, regardless of other flags', () => {
    assert.equal(
      resolveRecognitionGate({
        hasCameraLink: false,
        recognizerCount: 5,
      }),
      'needs_camera',
    );
    assert.equal(
      resolveRecognitionGate({
        hasCameraLink: false,
        recognizerCount: 0,
      }),
      'needs_camera',
    );
  });

  it('is empty when camera is linked but the account has no recognizers at all', () => {
    assert.equal(
      resolveRecognitionGate({
        hasCameraLink: true,
        recognizerCount: 0,
      }),
      'empty',
    );
  });

  it('is ready when camera is linked and a recognizer exists anywhere in the account', () => {
    assert.equal(
      resolveRecognitionGate({
        hasCameraLink: true,
        recognizerCount: 1,
      }),
      'ready',
    );
    assert.equal(
      resolveRecognitionGate({
        hasCameraLink: true,
        recognizerCount: 3,
      }),
      'ready',
    );
  });
});

describe('addDraftReferenceImages', () => {
  it('appends media ids to an existing pet key', () => {
    const result = addDraftReferenceImages(draft(), 1, [12]);
    assert.deepEqual(result.referenceImages['1'], [10, 11, 12]);
  });

  it('creates a new pet key when absent', () => {
    const result = addDraftReferenceImages(draft(), 2, [20]);
    assert.deepEqual(result.referenceImages['2'], [20]);
  });

  it('drops ids the pet already has, keeping the existing order', () => {
    const result = addDraftReferenceImages(draft(), 1, [11, 12, 10]);
    assert.deepEqual(result.referenceImages['1'], [10, 11, 12]);
  });

  it('drops duplicates within the incoming batch, keeping first occurrence', () => {
    const result = addDraftReferenceImages(draft(), 2, [20, 21, 20, 21]);
    assert.deepEqual(result.referenceImages['2'], [20, 21]);
  });

  it('returns the draft unchanged when every id is already present', () => {
    const input = draft();
    const result = addDraftReferenceImages(input, 1, [10, 11]);
    assert.equal(result, input);
  });

  it('does not materialize a key for an empty or all-duplicate batch', () => {
    const input = draft();
    const result = addDraftReferenceImages(input, 2, []);
    assert.equal(result, input);
    assert.equal('2' in result.referenceImages, false);
  });

  it('does not mutate the input draft', () => {
    const input = draft();
    addDraftReferenceImages(input, 1, [12]);
    assert.deepEqual(input.referenceImages['1'], [10, 11]);
  });
});

describe('removeDraftReferenceImage', () => {
  it('removes the given media id from a pet key', () => {
    const result = removeDraftReferenceImage(draft(), 1, 10);
    assert.deepEqual(result.referenceImages['1'], [11]);
  });

  it('is a true no-op when the pet key is absent', () => {
    const input = draft();
    const result = removeDraftReferenceImage(input, 9, 10);
    assert.equal(result, input);
    assert.equal('9' in result.referenceImages, false);
  });

  it('does not mutate the input draft', () => {
    const input = draft();
    removeDraftReferenceImage(input, 1, 10);
    assert.deepEqual(input.referenceImages['1'], [10, 11]);
  });
});
