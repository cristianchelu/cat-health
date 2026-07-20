import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseStoredEventData } from '../storedEventData.ts';

describe('parseStoredEventData', () => {
  it('accepts weight_measurement', () => {
    const valid = { type: 'weight_measurement', weight: 4200 };
    assert.deepEqual(parseStoredEventData(valid), valid);
    assert.equal(parseStoredEventData({ type: 'weight_measurement' }), null);
    assert.equal(
      parseStoredEventData({ type: 'weight_measurement', weight: 'x' }),
      null,
    );
  });

  it('accepts water_intake', () => {
    const valid = {
      type: 'water_intake',
      amount: 12,
      duration: 4,
      source: 'drinking',
      filtered: true,
    };
    assert.deepEqual(parseStoredEventData(valid), valid);
    assert.equal(
      parseStoredEventData({
        type: 'water_intake',
        amount: 1,
        source: 'spill',
      }),
      null,
    );
    assert.equal(parseStoredEventData({ type: 'water_intake' }), null);
  });

  it('accepts litterbox_use', () => {
    const valid = {
      type: 'litterbox_use',
      elimination_type: 'urination',
      elimination_weight: 30,
      duration: 45,
      straining: false,
      annotation: {
        bouts: [
          {
            bout_index: 0,
            t_start_s: 1,
            t_end_s: 2,
            bout_type: 'urination',
          },
        ],
      },
      segments: [
        {
          state: 'elimination',
          start: 0,
          end: 10,
          elimination_type: 'urination',
        },
      ],
    };
    assert.deepEqual(parseStoredEventData(valid), valid);
    assert.equal(
      parseStoredEventData({
        type: 'litterbox_use',
        elimination_type: 'nope',
        elimination_weight: 1,
        duration: 1,
      }),
      null,
    );
    assert.equal(
      parseStoredEventData({
        type: 'litterbox_use',
        elimination_type: 'urination',
        elimination_weight: 1,
        duration: 1,
        annotation: { bouts: [{ bout_index: 0 }] },
      }),
      null,
    );
  });

  it('accepts food_intake', () => {
    const valid = {
      type: 'food_intake',
      food_type: 'wet',
      amount: 40,
      food_id: 3,
      nutrients: { calories: 50, protein_g: 4 },
      provider_data: { provider: 'surepet', external_key: 'feed-1' },
    };
    assert.deepEqual(parseStoredEventData(valid), valid);
    assert.equal(
      parseStoredEventData({ type: 'food_intake', food_type: 'wet' }),
      null,
    );
    assert.equal(
      parseStoredEventData({
        type: 'food_intake',
        food_type: 'wet',
        amount: 1,
        nutrients: { calories: 'high' },
      }),
      null,
    );
  });

  it('accepts litterbox_maintenance', () => {
    const valid = {
      type: 'litterbox_maintenance',
      maintenance_type: 'scoop',
      litter_amount: 500,
    };
    assert.deepEqual(parseStoredEventData(valid), valid);
    assert.equal(
      parseStoredEventData({
        type: 'litterbox_maintenance',
        maintenance_type: 'vacuum',
      }),
      null,
    );
  });

  it('accepts device_connectivity', () => {
    const valid = {
      type: 'device_connectivity',
      state: 'offline',
      previous_state: 'unknown',
    };
    assert.deepEqual(parseStoredEventData(valid), valid);
    assert.equal(
      parseStoredEventData({ type: 'device_connectivity', state: 'sleeping' }),
      null,
    );
  });

  it('accepts pet_presence', () => {
    const valid = {
      type: 'pet_presence',
      state: 'away',
      context: 'vet',
      previous_state: 'home',
    };
    assert.deepEqual(parseStoredEventData(valid), valid);
    assert.equal(
      parseStoredEventData({ type: 'pet_presence', state: 'missing' }),
      null,
    );
  });

  it('rejects non-objects and unknown discriminants', () => {
    assert.equal(parseStoredEventData(null), null);
    assert.equal(parseStoredEventData([]), null);
    assert.equal(parseStoredEventData({ type: 'not_an_event' }), null);
    assert.equal(parseStoredEventData({}), null);
  });
});
