import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NON_PET_CAUSES } from 'shared';

import { InferenceProvider } from '../InferenceProvider.ts';
import {
  resolveIdentification,
  watchedPets,
} from '../PetRecognizerController.ts';

describe('InferenceProvider', () => {
  const provider = new InferenceProvider();

  it('accepts account config with api_key and base_url', () => {
    assert.equal(
      provider.validateAccountConfig({
        api_key: 'test-key',
        base_url: 'http://inference.local:8080',
      }),
      true,
    );
  });

  it('rejects empty or partial account config', () => {
    assert.equal(provider.validateAccountConfig(null), false);
    assert.equal(provider.validateAccountConfig({ api_key: 'only-key' }), false);
    assert.equal(
      provider.validateAccountConfig({ base_url: 'http://inference.local' }),
      false,
    );
  });
});

describe('resolveIdentification', () => {
  const PETS = [
    { id: 1, name: 'Mochi' },
    { id: 2, name: 'Bean' },
  ];

  it('matches a pet by name', () => {
    const result = resolveIdentification('Mochi', PETS);
    assert.equal(result.pet_id, 1);
    assert.equal(result.caused_by, 'pet');
    assert.equal(result.pet_name, 'Mochi');
  });

  it('matches a pet named inside a sentence', () => {
    const result = resolveIdentification('That looks like Bean.', PETS);
    assert.equal(result.pet_id, 2);
    assert.equal(result.caused_by, 'pet');
  });

  it('reports the specific non-pet cause the model named', () => {
    for (const cause of NON_PET_CAUSES) {
      const result = resolveIdentification(cause, PETS);
      assert.equal(result.caused_by, cause);
      assert.equal(result.pet_id, null);
    }
  });

  it('reads a cause through punctuation and casing drift', () => {
    for (const raw of [
      'Robot vacuum',
      'ROBOT_VACUUM.',
      ' robot-vacuum ',
      'robot vacuum!',
    ]) {
      assert.equal(
        resolveIdentification(raw, PETS).caused_by,
        'robot_vacuum',
        `expected robot_vacuum for ${JSON.stringify(raw)}`,
      );
    }
  });

  it('checks causes before pet names', () => {
    // The pet match is a substring test, so a pet whose name appears inside a
    // cause token would hijack it if the order were reversed.
    const pets = [{ id: 7, name: 'Human' }, ...PETS];
    const result = resolveIdentification('human', pets);
    assert.equal(result.caused_by, 'human');
    assert.equal(result.pet_id, null);
  });

  it('matches a cause only on the whole answer', () => {
    // "a human is holding the cat" is not the `human` cause; a bare substring
    // test would read it as one.
    const result = resolveIdentification('a human is holding Mochi', PETS);
    assert.equal(result.caused_by, 'pet');
    assert.equal(result.pet_id, 1);
  });

  it('reports unknown when nothing matches', () => {
    const result = resolveIdentification('unknown', PETS);
    assert.equal(result.pet_id, null);
    assert.equal(result.caused_by, 'unknown');
  });

  it('reports unknown, not a cause, for a hedged non-answer', () => {
    // "I cannot tell" is an animal we failed on, not a confirmed absence.
    const result = resolveIdentification(
      'I cannot tell which cat this is',
      PETS,
    );
    assert.equal(result.caused_by, 'unknown');
  });

  it('will not name a pet that was not among the candidates', () => {
    // A recognizer with Bean switched off never shows the model her photos, but
    // the model can still say "Bean" — from the scene description, or from a
    // plain wrong guess. Matching against every pet on record would attribute
    // the event to the one pet this camera is configured never to see.
    const result = resolveIdentification('Bean', [PETS[0]]);
    assert.equal(result.pet_id, null);
    assert.equal(result.caused_by, 'unknown');
  });

  it('resolves nothing when every pet is switched off', () => {
    const result = resolveIdentification('Mochi', []);
    assert.equal(result.caused_by, 'unknown');
  });
});

describe('watchedPets', () => {
  const PETS = [
    { id: 1, name: 'Mochi' },
    { id: 2, name: 'Bean' },
  ];
  const REFS = { '1': [10, 11], '2': [20] };

  it('watches every pet with reference images when none are switched off', () => {
    const watched = watchedPets(PETS, { reference_images: REFS });
    assert.deepEqual(
      watched.map((w) => w.pet.name),
      ['Mochi', 'Bean'],
    );
    assert.deepEqual(watched[0].mediaIds, [10, 11]);
  });

  it('drops a pet that is switched off, and keeps their photos configured', () => {
    const config = { reference_images: REFS, ignored_pets: [2] };
    const watched = watchedPets(PETS, config);

    assert.deepEqual(
      watched.map((w) => w.pet.name),
      ['Mochi'],
    );
    // The exclusion is about who this camera is asked about, not about
    // discarding curation: switching Bean back on must not cost a re-pick.
    assert.deepEqual(config.reference_images['2'], [20]);
  });

  it('drops a pet with no reference images', () => {
    const watched = watchedPets(PETS, { reference_images: { '1': [10] } });
    assert.deepEqual(
      watched.map((w) => w.pet.name),
      ['Mochi'],
    );
  });

  it('treats an empty reference list the same as a missing one', () => {
    const watched = watchedPets(PETS, {
      reference_images: { '1': [10], '2': [] },
    });
    assert.deepEqual(
      watched.map((w) => w.pet.name),
      ['Mochi'],
    );
  });

  it('ignores an id for a pet that no longer exists', () => {
    // Deleting a pet does not rewrite every recognizer's config, so a stale id
    // outlives them. It must not shift or drop anyone else.
    const watched = watchedPets(PETS, {
      reference_images: REFS,
      ignored_pets: [99],
    });
    assert.equal(watched.length, 2);
  });

  it('watches nobody when every pet is switched off', () => {
    assert.deepEqual(
      watchedPets(PETS, { reference_images: REFS, ignored_pets: [1, 2] }),
      [],
    );
  });
});
