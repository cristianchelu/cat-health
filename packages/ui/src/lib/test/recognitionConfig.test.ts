import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProviderAccountDTO, ProviderInfoDTO } from 'shared';

import {
  addDraftReferenceImages,
  buildRecognitionConfig,
  draftFromRecognitionConfig,
  draftFromRecognitionLink,
  isPetWatched,
  listRecognitionAccounts,
  recognitionConfigEqual,
  removeDraftReferenceImage,
  resolveRecognitionGate,
  resolveRecognitionSaveAction,
  setPetWatched,
  type RecognitionConfigDraft,
} from '../recognitionConfig.ts';

function draft(
  overrides: Partial<RecognitionConfigDraft> = {},
): RecognitionConfigDraft {
  return {
    accountId: 7,
    model: '',
    promptTemplate: 'the hallway fountain',
    autoIdentify: true,
    ignoredPets: [],
    referenceImages: {},
    ...overrides,
  };
}

describe('recognitionConfigEqual', () => {
  it('is true for identical drafts', () => {
    assert.equal(recognitionConfigEqual(draft(), draft()), true);
  });

  it('notices every editable field', () => {
    assert.equal(
      recognitionConfigEqual(draft(), draft({ accountId: 8 })),
      false,
    );
    assert.equal(
      recognitionConfigEqual(draft(), draft({ model: 'other/model' })),
      false,
    );
    assert.equal(
      recognitionConfigEqual(draft(), draft({ promptTemplate: 'elsewhere' })),
      false,
    );
    assert.equal(
      recognitionConfigEqual(draft(), draft({ autoIdentify: false })),
      false,
    );
    assert.equal(
      recognitionConfigEqual(draft(), draft({ ignoredPets: [2] })),
      false,
    );
    assert.equal(
      recognitionConfigEqual(draft(), draft({ referenceImages: { 1: [10] } })),
      false,
    );
  });

  it('ignores the order of ignored pets and reference ids', () => {
    assert.equal(
      recognitionConfigEqual(
        draft({ ignoredPets: [1, 2], referenceImages: { 1: [10, 11] } }),
        draft({ ignoredPets: [2, 1], referenceImages: { 1: [11, 10] } }),
      ),
      true,
    );
  });

  it('treats two unlinked drafts as equal whatever their config says', () => {
    // Config-only edits while unlinked have nothing to save, so counting them
    // as dirty would enable a Save button that does nothing.
    assert.equal(
      recognitionConfigEqual(
        draft({ accountId: null }),
        draft({ accountId: null, promptTemplate: 'typed while unlinked' }),
      ),
      true,
    );
  });
});

describe('draftFromRecognitionLink', () => {
  it('carries the account id and every config field across', () => {
    assert.deepEqual(
      draftFromRecognitionLink({
        account_id: 3,
        config: {
          model: 'vendor/model',
          prompt_template: 'the litter tray',
          auto_identify: false,
          reference_images: { 1: [10, 11] },
          ignored_pets: [2, 1],
        },
      }),
      {
        accountId: 3,
        model: 'vendor/model',
        promptTemplate: 'the litter tray',
        autoIdentify: false,
        ignoredPets: [1, 2],
        referenceImages: { 1: [10, 11] },
      },
    );
  });

  it('reads a null model back as the empty field that means "default"', () => {
    const drafted = draftFromRecognitionLink({
      account_id: 3,
      config: {
        model: null,
        prompt_template: 'x',
        auto_identify: true,
        reference_images: {},
      },
    });
    assert.equal(drafted.model, '');
    assert.equal(buildRecognitionConfig(drafted).model, null);
  });

  it('starts an unlinked device with an empty scene, auto-identify on', () => {
    const drafted = draftFromRecognitionLink(null);
    assert.equal(drafted.accountId, null);
    // Empty, not a shipped template: the form shows the example as a
    // placeholder, and scene context is optional.
    assert.equal(drafted.promptTemplate, '');
    assert.equal(drafted.autoIdentify, true);
  });
});

describe('buildRecognitionConfig', () => {
  it('persists an empty model as null, and trims one that was typed', () => {
    assert.equal(buildRecognitionConfig(draft({ model: '   ' })).model, null);
    assert.equal(
      buildRecognitionConfig(draft({ model: '  vendor/model ' })).model,
      'vendor/model',
    );
  });

  it('drops pets whose reference list was emptied', () => {
    assert.deepEqual(
      buildRecognitionConfig(draft({ referenceImages: { 1: [10], 2: [] } }))
        .reference_images,
      { 1: [10] },
    );
  });

  it('omits an emptied denylist rather than storing []', () => {
    assert.equal(
      'ignored_pets' in buildRecognitionConfig(draft({ ignoredPets: [] })),
      false,
    );
    assert.deepEqual(
      buildRecognitionConfig(draft({ ignoredPets: [2, 1] })).ignored_pets,
      [1, 2],
    );
  });

  it('round-trips through draftFromRecognitionConfig', () => {
    const config = buildRecognitionConfig(
      draft({
        model: 'vendor/model',
        ignoredPets: [4],
        referenceImages: { 1: [9] },
      }),
    );
    const back = draftFromRecognitionConfig(config);
    assert.deepEqual(buildRecognitionConfig({ ...back, accountId: 7 }), config);
  });
});

describe('resolveRecognitionSaveAction', () => {
  it('does nothing when the draft is unchanged', () => {
    assert.deepEqual(resolveRecognitionSaveAction(draft(), draft()), {
      type: 'none',
    });
  });

  it('unlinks when a linked device drops its account', () => {
    assert.deepEqual(
      resolveRecognitionSaveAction(draft(), draft({ accountId: null })),
      { type: 'unlink' },
    );
  });

  it('does nothing when an unlinked device was only edited', () => {
    assert.deepEqual(
      resolveRecognitionSaveAction(
        draft({ accountId: null }),
        draft({ accountId: null, promptTemplate: 'typed while unlinked' }),
      ),
      { type: 'none' },
    );
  });

  it('links when the account changes, carrying the drafted config', () => {
    const action = resolveRecognitionSaveAction(
      draft({ accountId: null }),
      draft({ accountId: 9, model: 'vendor/model' }),
    );
    assert.equal(action.type, 'link');
    assert.deepEqual(action, {
      type: 'link',
      accountId: 9,
      config: buildRecognitionConfig(
        draft({ accountId: 9, model: 'vendor/model' }),
      ),
    });
  });

  it('patches the config when only the config changed', () => {
    const action = resolveRecognitionSaveAction(
      draft(),
      draft({ autoIdentify: false }),
    );
    assert.deepEqual(action, {
      type: 'updateConfig',
      config: buildRecognitionConfig(draft({ autoIdentify: false })),
    });
  });
});

describe('watch toggles and reference edits', () => {
  it('reads and writes the denylist inverted', () => {
    assert.equal(isPetWatched(undefined, 1), true);
    assert.equal(isPetWatched([1], 1), false);
    assert.deepEqual(setPetWatched([2], 1, false), [1, 2]);
    assert.deepEqual(setPetWatched([1, 2], 1, true), [2]);
  });

  it('appends only ids the pet does not already have', () => {
    const base = draft({ referenceImages: { 1: [10] } });
    assert.deepEqual(
      addDraftReferenceImages(base, 1, [10, 11, 11]).referenceImages,
      { 1: [10, 11] },
    );
  });

  it('returns the same draft when a batch adds nothing', () => {
    const base = draft({ referenceImages: { 1: [10] } });
    assert.equal(addDraftReferenceImages(base, 1, [10]), base);
    assert.equal(addDraftReferenceImages(base, 2, []), base);
  });

  it('leaves a pet with no entry untouched on removal', () => {
    const base = draft({ referenceImages: { 1: [10] } });
    assert.equal(removeDraftReferenceImage(base, 2, 10), base);
    assert.deepEqual(removeDraftReferenceImage(base, 1, 10).referenceImages, {
      1: [],
    });
  });
});

const account = (
  overrides: Partial<ProviderAccountDTO>,
): ProviderAccountDTO => ({
  id: 1,
  provider: 'inference',
  name: 'OpenRouter',
  config: {},
  enabled: true,
  internal: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const PROVIDERS: ProviderInfoDTO[] = [
  {
    name: 'inference',
    internal: false,
    capabilities: { supported_device_types: [], supports_recognition: true },
  },
  {
    name: 'esphome',
    internal: true,
    capabilities: { supported_device_types: ['litterbox'] },
  },
];

describe('listRecognitionAccounts', () => {
  it('keeps enabled accounts whose provider can answer a vision prompt', () => {
    assert.deepEqual(
      listRecognitionAccounts([account({ id: 1 })], PROVIDERS).map((a) => a.id),
      [1],
    );
  });

  it('drops switched-off accounts and providers without the capability', () => {
    assert.deepEqual(
      listRecognitionAccounts(
        [
          account({ id: 1, enabled: false }),
          account({ id: 2, provider: 'esphome' }),
          account({ id: 3, provider: 'ghost' }),
        ],
        PROVIDERS,
      ),
      [],
    );
  });
});

describe('resolveRecognitionGate', () => {
  it('makes the camera link the hard gate', () => {
    assert.equal(
      resolveRecognitionGate({ hasCameraLink: false, accountCount: 3 }),
      'needs_camera',
    );
  });

  it('reports no_account only once a camera is linked', () => {
    assert.equal(
      resolveRecognitionGate({ hasCameraLink: true, accountCount: 0 }),
      'no_account',
    );
  });

  it('is ready with a camera and somewhere to bill the call', () => {
    assert.equal(
      resolveRecognitionGate({ hasCameraLink: true, accountCount: 1 }),
      'ready',
    );
  });
});
