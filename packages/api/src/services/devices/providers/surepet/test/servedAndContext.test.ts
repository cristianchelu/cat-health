import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractFeedingDatapointsFromTimeline,
  extractFeedingDatapointsFromReportPairs,
} from '../extractFeedingEvents.ts';
import { mapServedDatapointToEvent } from '../mapFeedingEvent.ts';
import type { SurePetTimelineEntry } from '../types.ts';

/**
 * Fixtures are trimmed copies of real `/api/timeline/household/{id}` rows: the
 * two feeders filled on 2026-09-24, the tare that preceded one of them, and a
 * meal from the same page.
 */
const BOWL_FILLED_63G: SurePetTimelineEntry = {
  id: 17909594588,
  type: 21,
  data: '{"weight":{"count":1,"food_type":[2,0],"target":[65,0],"tare_value":null}}',
  created_at: '2026-09-24T05:49:38+00:00',
  weights: [
    {
      id: 1600309836,
      device_id: 1187297,
      tag_id: 0,
      context: 5,
      duration: 126,
      created_at: '2026-09-24T05:49:38+00:00',
      frames: [
        { index: 0, current_weight: 63, change: 63 },
        { index: 1, current_weight: 0, change: 0 },
      ],
    },
  ],
};

const FEEDER_RESET: SurePetTimelineEntry = {
  id: 17909591458,
  type: 24,
  data: '{"tare_type":3,"weight":{"food_type":[2,0],"target":[65,0]}}',
  created_at: '2026-09-24T05:49:10+00:00',
  weights: [
    {
      id: 1600309506,
      device_id: 1187297,
      tag_id: 0,
      context: 6,
      duration: 0,
      created_at: '2026-09-24T05:49:10+00:00',
      frames: [
        { index: 0, current_weight: 1, change: 1 },
        { index: 1, current_weight: 0, change: 0 },
      ],
    },
  ],
};

const PET_HAS_EATEN_5G: SurePetTimelineEntry = {
  id: 17915773573,
  type: 22,
  data: '{"weight":{"food_type":[2,0],"target":[65,0]}}',
  created_at: '2026-09-24T19:06:50+00:00',
  pets: [{ id: 779258, tag_id: 3662632 }],
  weights: [
    {
      id: 1600917389,
      device_id: 1187297,
      tag_id: 3662632,
      context: 1,
      duration: 89,
      created_at: '2026-09-24T19:06:50+00:00',
      frames: [
        { index: 0, current_weight: 33, change: -5 },
        { index: 1, current_weight: 0, change: 0 },
      ],
    },
  ],
};

describe('servings extracted from the timeline', () => {
  it('reads the filled grams off the positive frame change', () => {
    const { served, datapoints } = extractFeedingDatapointsFromTimeline([
      BOWL_FILLED_63G,
    ]);

    assert.equal(datapoints.length, 0, 'a fill is not a meal');
    assert.equal(served.length, 1);
    assert.equal(served[0]?.amount_g, 63);
    assert.equal(served[0]?.bowl_index, 0);
    assert.equal(served[0]?.device_id, 1187297);
    // 63 g arrived and the bowl reached 63 g, so it had been empty.
    assert.equal(served[0]?.level_before_g, 0);
    assert.equal(served[0]?.level_after_g, 63);
    // Read off the entry's own payload, not inferred from the device control.
    assert.equal(served[0]?.food_type_id, 2);
  });

  it('keeps a top-up onto leftovers distinguishable by its level', () => {
    const { served } = extractFeedingDatapointsFromTimeline([
      {
        ...BOWL_FILLED_63G,
        weights: [
          {
            ...BOWL_FILLED_63G.weights![0]!,
            frames: [{ index: 0, current_weight: 50, change: 20 }],
          },
        ],
      },
    ]);

    assert.equal(served.length, 1);
    assert.equal(served[0]?.amount_g, 20);
    assert.equal(served[0]?.level_before_g, 30);
    assert.equal(served[0]?.level_after_g, 50);
  });

  it('ignores a tare, whose frames are an artefact of zeroing', () => {
    const { served, datapoints } = extractFeedingDatapointsFromTimeline([
      FEEDER_RESET,
    ]);

    assert.equal(served.length, 0);
    assert.equal(datapoints.length, 0);
  });

  it('separates the two directions on one page', () => {
    const { served, datapoints, maxEntryId } =
      extractFeedingDatapointsFromTimeline([
        PET_HAS_EATEN_5G,
        BOWL_FILLED_63G,
        FEEDER_RESET,
      ]);

    assert.equal(served.length, 1);
    assert.equal(served[0]?.amount_g, 63);
    assert.equal(datapoints.length, 1);
    assert.equal(datapoints[0]?.amount_g, 5);
    assert.equal(maxEntryId, 17915773573);
  });
});

describe('weight context decides attribution', () => {
  it('keeps the chip read for a recognised pet', () => {
    const { datapoints } = extractFeedingDatapointsFromTimeline([
      PET_HAS_EATEN_5G,
    ]);
    assert.equal(datapoints[0]?.cause, 'pet');
    assert.equal(datapoints[0]?.pet_id, 779258);
  });

  it('refuses to name a pet for an intruder, keeping the grams', () => {
    const { datapoints } = extractFeedingDatapointsFromTimeline([
      {
        ...PET_HAS_EATEN_5G,
        weights: [{ ...PET_HAS_EATEN_5G.weights![0]!, context: 2 }],
      },
    ]);

    assert.equal(datapoints.length, 1);
    assert.equal(datapoints[0]?.amount_g, 5);
    assert.equal(datapoints[0]?.cause, 'other_animal');
    assert.equal(datapoints[0]?.pet_id, undefined);
  });

  it('leaves a reading the feeder distrusts unresolved', () => {
    const { datapoints } = extractFeedingDatapointsFromTimeline([
      {
        ...PET_HAS_EATEN_5G,
        weights: [{ ...PET_HAS_EATEN_5G.weights![0]!, context: 3 }],
      },
    ]);

    assert.equal(datapoints[0]?.cause, 'unknown');
    assert.equal(datapoints[0]?.pet_id, undefined);
  });

  it('falls back to the entry type when a record predates context', () => {
    const { datapoints, served } = extractFeedingDatapointsFromTimeline([
      {
        ...PET_HAS_EATEN_5G,
        weights: [{ ...PET_HAS_EATEN_5G.weights![0]!, context: undefined }],
      },
      {
        ...BOWL_FILLED_63G,
        weights: [{ ...BOWL_FILLED_63G.weights![0]!, context: undefined }],
      },
    ]);

    assert.equal(datapoints.length, 1);
    assert.equal(datapoints[0]?.cause, 'pet');
    assert.equal(served.length, 1);
    assert.equal(served[0]?.amount_g, 63);
  });
});

describe('report datapoints carry the amount in change, not weight', () => {
  /** Verbatim from `/api/v2/report/household/{hh}/pet/{pet}/aggregate`. */
  const REPORT = [
    {
      pet_id: 779258,
      device_id: 1187297,
      feeding: {
        datapoints: [
          {
            from: '2026-09-24T06:09:00+00:00',
            to: '2026-09-24T06:10:02+00:00',
            duration: 62,
            context: 1,
            bowl_count: 1,
            device_id: 1187297,
            weights: [
              {
                index: 0,
                weight: 59,
                change: -3,
                food_type_id: 2,
                target_weight: 65,
              },
              { index: 1, weight: 0, change: 0 },
            ],
            actual_weight: 33,
          },
        ],
      },
    },
  ];

  it('records the 3 g eaten, not the 59 g left in the bowl', () => {
    const datapoints = extractFeedingDatapointsFromReportPairs(REPORT);

    assert.equal(datapoints.length, 1);
    assert.equal(datapoints[0]?.amount_g, 3);
    assert.equal(datapoints[0]?.bowl_index, 0);
  });

  it('never falls back to actual_weight, which is the same on every row', () => {
    const datapoints = extractFeedingDatapointsFromReportPairs([
      {
        ...REPORT[0],
        feeding: {
          datapoints: [
            {
              ...REPORT[0]!.feeding.datapoints[0]!,
              weights: [],
              actual_weight: 33,
            },
          ],
        },
      },
    ]);

    assert.equal(datapoints.length, 0);
  });
});

describe('mapServedDatapointToEvent', () => {
  it('builds a pet-less food_served event with both bowl levels', () => {
    const { served } = extractFeedingDatapointsFromTimeline([BOWL_FILLED_63G]);
    const event = mapServedDatapointToEvent({
      datapoint: served[0]!,
      localDeviceId: 15,
    });

    assert.equal(event.data.type, 'food_served');
    assert.equal(event.data.amount, 63);
    assert.equal(event.data.food_type, 'dry');
    assert.equal(event.data.level_before, 0);
    assert.equal(event.data.level_after, 63);
    assert.equal(event.pet_id, undefined);
    assert.equal(event.device_id, 15);
  });
});

describe('a serving from a feeder that does not weigh its bowl', () => {
  it('omits both levels rather than reporting an empty bowl', () => {
    const { served } = extractFeedingDatapointsFromTimeline([
      {
        ...BOWL_FILLED_63G,
        weights: [
          {
            ...BOWL_FILLED_63G.weights![0]!,
            frames: [{ index: 0, change: 40 }],
          },
        ],
      },
    ]);

    assert.equal(served.length, 1);
    assert.equal(served[0]?.amount_g, 40);
    assert.equal(served[0]?.level_before_g, undefined);
    assert.equal(served[0]?.level_after_g, undefined);

    const event = mapServedDatapointToEvent({
      datapoint: served[0]!,
      localDeviceId: 15,
    });
    assert.equal(event.data.level_before, undefined);
    assert.equal(event.data.level_after, undefined);
  });
});
