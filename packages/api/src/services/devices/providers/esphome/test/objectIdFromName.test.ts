import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { objectIdFromName } from '../BaseESPHomeController.ts';

describe('objectIdFromName', () => {
  it('matches ESPHome object_id derivation for real entity names', () => {
    // Names as broadcast by the actual devices; expected ids are what the
    // SENSORS constants in the controllers look up.
    assert.equal(objectIdFromName('Water Level'), 'water_level');
    assert.equal(objectIdFromName('WiFi Signal'), 'wifi_signal');
    assert.equal(objectIdFromName('Unfiltered Weight'), 'unfiltered_weight');
    assert.equal(objectIdFromName('Activity'), 'activity');
    assert.equal(objectIdFromName('Visits Since Clean'), 'visits_since_clean');
    assert.equal(objectIdFromName('Deep Clean Timer'), 'deep_clean_timer');
    assert.equal(
      objectIdFromName('Water Rate of Change'),
      'water_rate_of_change',
    );
  });

  it('sanitizes characters outside [a-z0-9-_] to underscores', () => {
    assert.equal(objectIdFromName("Jazz's Bowl #2"), 'jazz_s_bowl__2');
    assert.equal(objectIdFromName('Temp (C)'), 'temp__c_');
  });

  it('returns null for missing or empty names', () => {
    assert.equal(objectIdFromName(''), null);
    assert.equal(objectIdFromName(undefined), null);
    assert.equal(objectIdFromName(42), null);
  });
});
