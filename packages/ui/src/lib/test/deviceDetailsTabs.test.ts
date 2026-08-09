import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceType } from 'shared';

import { getDeviceDetailsTabs } from '../deviceDetailsTabs.ts';

function tabs(type: DeviceType) {
  return getDeviceDetailsTabs({ type });
}

describe('getDeviceDetailsTabs', () => {
  it('returns activity tabs for litterbox without settings', () => {
    assert.deepEqual(tabs('litterbox'), [
      'overview',
      'history',
      'camera',
      'recognition',
    ]);
  });

  it('returns activity tabs for water_fountain without settings', () => {
    assert.deepEqual(tabs('water_fountain'), [
      'overview',
      'history',
      'camera',
      'recognition',
    ]);
  });

  it('returns activity tabs plus settings for feeder', () => {
    assert.deepEqual(tabs('feeder'), [
      'overview',
      'history',
      'camera',
      'recognition',
      'settings',
    ]);
  });

  it('returns reference-images for pet_recognizer without peer or settings tabs', () => {
    assert.deepEqual(tabs('pet_recognizer'), [
      'overview',
      'history',
      'reference-images',
    ]);
  });

  it('returns overview and history only for camera', () => {
    assert.deepEqual(tabs('camera'), ['overview', 'history']);
  });
});
