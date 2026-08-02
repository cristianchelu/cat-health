import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NON_PET_CAUSES } from 'shared';

import {
  attributionFromEvent,
  attributionFromSelectValue,
  attributionSelectOptions,
  attributionSelectValue,
  attributionToPatch,
  causeLabelKey,
} from '../eventAttribution.ts';

describe('attribution select encoding', () => {
  it('round-trips a pet and every cause', () => {
    const attributions = [
      { petId: 4, causedBy: 'pet' as const },
      { petId: null, causedBy: 'unknown' as const },
      ...NON_PET_CAUSES.map((causedBy) => ({ petId: null, causedBy })),
    ];
    for (const attribution of attributions) {
      assert.deepEqual(
        attributionFromSelectValue(attributionSelectValue(attribution)),
        attribution,
        `round trip failed for ${JSON.stringify(attribution)}`,
      );
    }
  });

  it('keeps pet ids in their own namespace', () => {
    // A pet must never collide with a cause token, however either list grows.
    const petValue = attributionSelectValue({ petId: 7, causedBy: 'pet' });
    assert.equal(petValue, 'pet:7');
    assert.notEqual(petValue, 'pet');
    for (const cause of NON_PET_CAUSES) {
      assert.notEqual(petValue, cause);
    }
  });

  it('reads pet with no id back as unresolved', () => {
    // Nothing offers this in the picker, so the closest honest select value is
    // the unresolved one rather than inventing a pet.
    assert.equal(
      attributionSelectValue({ petId: null, causedBy: 'pet' }),
      'pet',
    );
  });

  it('falls back to unresolved for an unusable value', () => {
    for (const value of ['', 'pet:0', 'pet:-3', 'pet:abc', 'nonsense']) {
      assert.deepEqual(
        attributionFromSelectValue(value),
        { petId: null, causedBy: 'unknown' },
        `expected unresolved for ${JSON.stringify(value)}`,
      );
    }
  });

  it('carries the served attribution through unchanged', () => {
    assert.deepEqual(
      attributionFromEvent({ pet_id: 9, caused_by: 'pet' }),
      { petId: 9, causedBy: 'pet' },
    );
    assert.deepEqual(
      attributionFromEvent({ pet_id: null, caused_by: 'robot_vacuum' }),
      { petId: null, causedBy: 'robot_vacuum' },
    );
  });

  it('patches both fields together so they cannot contradict', () => {
    assert.deepEqual(
      attributionToPatch({ petId: null, causedBy: 'human' }),
      { pet_id: null, caused_by: 'human' },
    );
    assert.deepEqual(attributionToPatch({ petId: 2, causedBy: 'pet' }), {
      pet_id: 2,
      caused_by: 'pet',
    });
  });
});

describe('attributionSelectOptions', () => {
  it('lists unresolved, then pets, then every non-pet cause', () => {
    const options = attributionSelectOptions([{ id: 1, name: 'Mochi' }], {
      unknown: 'Unknown',
      cause: (c) => `label:${c}`,
    });
    assert.deepEqual(
      options.map((o) => o.value),
      ['unknown', 'pet:1', ...NON_PET_CAUSES],
    );
  });

  it('grows with the cause vocabulary without a code change here', () => {
    const options = attributionSelectOptions([], {
      unknown: 'Unknown',
      cause: (c) => `label:${c}`,
    });
    // One entry per known non-pet cause, plus unresolved.
    assert.equal(options.length, NON_PET_CAUSES.length + 1);
  });
});

describe('causeLabelKey', () => {
  it('namespaces every cause under event_attribution', () => {
    assert.equal(causeLabelKey('robot_vacuum'), 'event_attribution.cause_robot_vacuum');
    assert.equal(causeLabelKey('pet'), 'event_attribution.cause_pet');
  });
});
