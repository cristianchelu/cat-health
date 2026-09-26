import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceType, SettingControl } from 'shared';

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

  it('adds settings for any device with settings that configure it', () => {
    const setting = (placement: 'setting' | 'control'): SettingControl => ({
      key: 'dev:number.interval',
      label: { text: 'Interval' },
      type: { kind: 'number' },
      placement,
      group: 'config',
      value: 12,
    });
    const withSettings = (placement: 'setting' | 'control') =>
      getDeviceDetailsTabs({
        type: 'water_fountain',
        controls: { settings: [setting(placement)], actions: [] },
      });

    assert.ok(withSettings('setting').includes('settings'));
    assert.ok(!withSettings('control').includes('settings'));
  });

  it('returns overview and history only for camera', () => {
    assert.deepEqual(tabs('camera'), ['overview', 'history']);
  });
});
