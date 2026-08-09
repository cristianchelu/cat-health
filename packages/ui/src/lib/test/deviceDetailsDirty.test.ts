import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldBlockDeviceDetailsTabLeave } from '../deviceDetailsDirty.ts';

describe('shouldBlockDeviceDetailsTabLeave', () => {
  it('does not block when the active tab is unchanged', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        activeTab: 'camera',
        nextTab: 'camera',
        cameraDirty: true,
        recognitionDirty: false,
        feederDirty: false,
      }),
      false,
    );
  });

  it('blocks leaving the camera tab only when the camera draft is dirty', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        activeTab: 'camera',
        nextTab: 'overview',
        cameraDirty: true,
        recognitionDirty: false,
        feederDirty: false,
      }),
      true,
    );
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        activeTab: 'camera',
        nextTab: 'overview',
        cameraDirty: false,
        recognitionDirty: true,
        feederDirty: true,
      }),
      false,
    );
  });

  it('blocks leaving the recognition tab only when the recognition draft is dirty', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        activeTab: 'recognition',
        nextTab: 'camera',
        cameraDirty: false,
        recognitionDirty: true,
        feederDirty: false,
      }),
      true,
    );
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        activeTab: 'recognition',
        nextTab: 'camera',
        cameraDirty: true,
        recognitionDirty: false,
        feederDirty: true,
      }),
      false,
    );
  });

  it('blocks leaving settings only when the feeder draft is dirty', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        activeTab: 'settings',
        nextTab: 'history',
        cameraDirty: false,
        recognitionDirty: false,
        feederDirty: true,
      }),
      true,
    );
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        activeTab: 'settings',
        nextTab: 'history',
        cameraDirty: true,
        recognitionDirty: true,
        feederDirty: false,
      }),
      false,
    );
  });

  it('never blocks leaving overview or history', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        activeTab: 'overview',
        nextTab: 'camera',
        cameraDirty: true,
        recognitionDirty: true,
        feederDirty: true,
      }),
      false,
    );
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        activeTab: 'history',
        nextTab: 'recognition',
        cameraDirty: true,
        recognitionDirty: true,
        feederDirty: true,
      }),
      false,
    );
  });
});
