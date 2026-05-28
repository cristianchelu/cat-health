import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFeederFoodCompartments } from 'shared';
import { BowlType } from '../constants.ts';
import {
  buildFeedingExternalKey,
  expandTimelineWeightRecordToDatapoints,
  resolveLocalPetId,
} from '../extractFeedingEvents.ts';
import { resolveSurePetFoodCompartmentId } from '../foodCompartments.ts';
import type {
  SurePetTimelineEntry,
  SurePetTimelineWeightRecord,
} from '../types.ts';

const TYPE_22_WEIGHT_RECORD: SurePetTimelineWeightRecord = {
  id: 1476530307,
  device_id: 916511,
  tag_id: 3662632,
  duration: 75,
  created_at: '2026-05-27T10:36:41+00:00',
  frames: [
    { index: 0, change: -59, current_weight: -59 },
    { index: 1, change: 0, current_weight: 0 },
  ],
};

const TYPE_22_ENTRY: SurePetTimelineEntry = {
  id: 16495453285,
  type: 22,
  created_at: '2026-05-27T10:36:41+00:00',
  pets: [{ id: 1, tag_id: 3662632 }],
};

describe('expandTimelineWeightRecordToDatapoints', () => {
  it('emits one datapoint from live type-22 fixture (59g on index 0)', () => {
    const datapoints = expandTimelineWeightRecordToDatapoints(
      TYPE_22_WEIGHT_RECORD,
      TYPE_22_ENTRY,
      16495453285,
    );
    assert.equal(datapoints.length, 1);
    assert.equal(datapoints[0]?.amount_g, 59);
    assert.equal(datapoints[0]?.bowl_index, 0);
  });

  it('emits two datapoints when both frames have consumption', () => {
    const record: SurePetTimelineWeightRecord = {
      ...TYPE_22_WEIGHT_RECORD,
      frames: [
        { index: 0, change: -10 },
        { index: 1, change: -20 },
      ],
    };
    const datapoints = expandTimelineWeightRecordToDatapoints(
      record,
      TYPE_22_ENTRY,
      1,
    );
    assert.equal(datapoints.length, 2);
    assert.equal(datapoints[0]?.amount_g, 10);
    assert.equal(datapoints[0]?.bowl_index, 0);
    assert.equal(datapoints[1]?.amount_g, 20);
    assert.equal(datapoints[1]?.bowl_index, 1);
  });
});

describe('resolveLocalPetId', () => {
  it('maps SurePet cloud pet_id from provider_data to local pet', () => {
    const localPetId = resolveLocalPetId(
      {
        email: 'test@example.com',
        password: 'secret',
        pet_links: [
          {
            external_pet_id: '779257',
            pet_id: 2,
            metadata: { tag_id: 3662589 },
          },
        ],
      },
      {
        from: new Date('2026-05-28T21:59:11.000Z'),
        amount_g: 2,
        pet_id: 779257,
        tag_id: 3662589,
      },
    );
    assert.equal(localPetId, 2);
  });

  it('returns null when pet_links are missing despite provider ids on datapoint', () => {
    const localPetId = resolveLocalPetId(
      {
        email: 'test@example.com',
        password: 'secret',
        pet_links: [],
      },
      {
        from: new Date('2026-05-28T21:59:11.000Z'),
        amount_g: 2,
        pet_id: 779257,
        tag_id: 3662589,
      },
    );
    assert.equal(localPetId, null);
  });
});

describe('buildFeedingExternalKey', () => {
  it('differs when bowl_index differs', () => {
    const base = {
      device_id: 1,
      tag_id: 2,
      from: new Date('2026-05-27T10:36:41Z'),
      amount_g: 10,
      source_id: 'test',
    };
    const key0 = buildFeedingExternalKey({ ...base, bowl_index: 0 });
    const key1 = buildFeedingExternalKey({ ...base, bowl_index: 1 });
    assert.notEqual(key0, key1);
  });
});

describe('resolveSurePetFoodCompartmentId', () => {
  const largeControl = { bowls: { type: BowlType.LARGE } };
  const twoSmallControl = { bowls: { type: BowlType.TWO_SMALL } };

  it('maps LARGE to default regardless of bowl index', () => {
    assert.equal(
      resolveSurePetFoodCompartmentId(largeControl, 0),
      'default',
    );
    assert.equal(
      resolveSurePetFoodCompartmentId(largeControl, 1),
      'default',
    );
  });

  it('maps TWO_SMALL to compartment id by index', () => {
    assert.equal(
      resolveSurePetFoodCompartmentId(twoSmallControl, 0),
      '0',
    );
    assert.equal(
      resolveSurePetFoodCompartmentId(twoSmallControl, 1),
      '1',
    );
  });
});

describe('parseFeederFoodCompartments', () => {
  it('reads compartment assignments from config', () => {
    const map = parseFeederFoodCompartments({
      product_id: 4,
      food_compartments: [
        { compartment: 'default', food_id: 3 },
        { compartment: '0', food_id: null },
        { compartment: '1', food_id: 7 },
      ],
    });
    assert.equal(map.get('default'), 3);
    assert.equal(map.get('1'), 7);
    assert.equal(map.has('0'), false);
  });
});
