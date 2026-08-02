import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NON_PET_CAUSES } from 'shared';

import {
  attributionColumns,
  attributionColumnsFromRequest,
  isNonPetCause,
  isResolvedCause,
} from '../eventAttribution.ts';

describe('cause predicates', () => {
  it('treats only unknown as unresolved', () => {
    assert.equal(isResolvedCause('unknown'), false);
    assert.equal(isResolvedCause('pet'), true);
    for (const cause of NON_PET_CAUSES) {
      assert.equal(isResolvedCause(cause), true, cause);
    }
  });

  it('counts every settled non-pet cause as non-pet', () => {
    assert.equal(isNonPetCause('unknown'), false);
    assert.equal(isNonPetCause('pet'), false);
    for (const cause of NON_PET_CAUSES) {
      assert.equal(isNonPetCause(cause), true, cause);
    }
  });
});

describe('attributionColumns', () => {
  it('keeps a pet_id only alongside the pet cause', () => {
    assert.deepEqual(attributionColumns('pet', 7, 'microchip'), {
      pet_id: 7,
      caused_by: 'pet',
      attributed_by: 'microchip',
    });
  });

  it('drops a pet_id a caller passed with a non-pet cause', () => {
    // That pairing is the one thing the DB CHECK rejects; a writer should not
    // be able to trip it by forgetting to null the id.
    for (const cause of NON_PET_CAUSES) {
      assert.deepEqual(attributionColumns(cause, 7, 'manual'), {
        pet_id: null,
        caused_by: cause,
        attributed_by: 'manual',
      });
    }
  });

  it('drops a pet_id passed with unknown', () => {
    assert.deepEqual(attributionColumns('unknown', 7, null), {
      pet_id: null,
      caused_by: 'unknown',
      attributed_by: null,
    });
  });
});

describe('attributionColumnsFromRequest', () => {
  it('leaves the columns alone when the body says nothing', () => {
    assert.equal(attributionColumnsFromRequest({}), undefined);
    assert.equal(
      attributionColumnsFromRequest({ attributed_by: 'manual' }),
      undefined,
    );
  });

  it('reads a bare pet_id as the pet cause', () => {
    assert.deepEqual(attributionColumnsFromRequest({ pet_id: 4 }), {
      pet_id: 4,
      caused_by: 'pet',
      attributed_by: null,
    });
  });

  it('reads a bare null pet_id as unresolved', () => {
    assert.deepEqual(attributionColumnsFromRequest({ pet_id: null }), {
      pet_id: null,
      caused_by: 'unknown',
      attributed_by: null,
    });
  });

  it('rejects a pet_id alongside a non-pet cause', () => {
    for (const cause of NON_PET_CAUSES) {
      assert.equal(
        attributionColumnsFromRequest({ pet_id: 4, caused_by: cause }),
        'invalid',
        cause,
      );
    }
  });

  it('accepts pet with an explicitly absent pet_id', () => {
    // "A pet, but we cannot say which" — distinct from a contradiction.
    assert.deepEqual(
      attributionColumnsFromRequest({ pet_id: null, caused_by: 'pet' }),
      { pet_id: null, caused_by: 'pet', attributed_by: null },
    );
  });

  it('treats a nonsense pet_id as no pet named', () => {
    // JSON renders NaN as null, and 0 is not a row id; neither may reach the FK.
    for (const pet_id of [0, -1, 1.5, Number.NaN]) {
      assert.deepEqual(
        attributionColumnsFromRequest({ pet_id }),
        { pet_id: null, caused_by: 'unknown', attributed_by: null },
        `expected unresolved for pet_id ${pet_id}`,
      );
    }
  });

  it('applies the default source only to a settled cause', () => {
    assert.deepEqual(
      attributionColumnsFromRequest({ pet_id: 4, defaultSource: 'manual' }),
      { pet_id: 4, caused_by: 'pet', attributed_by: 'manual' },
    );
    assert.deepEqual(
      attributionColumnsFromRequest({ pet_id: null, defaultSource: 'manual' }),
      { pet_id: null, caused_by: 'unknown', attributed_by: null },
    );
  });

  it('lets an explicit source beat the default', () => {
    assert.deepEqual(
      attributionColumnsFromRequest({
        pet_id: 4,
        attributed_by: 'microchip',
        defaultSource: 'manual',
      }),
      { pet_id: 4, caused_by: 'pet', attributed_by: 'microchip' },
    );
  });

  it('always writes all three columns together', () => {
    for (const input of [
      { pet_id: 4 },
      { pet_id: null },
      { caused_by: 'human' as const },
    ]) {
      const columns = attributionColumnsFromRequest(input);
      assert.deepEqual(
        Object.keys(columns as object).sort(),
        ['attributed_by', 'caused_by', 'pet_id'],
        `incomplete columns for ${JSON.stringify(input)}`,
      );
    }
  });
});
