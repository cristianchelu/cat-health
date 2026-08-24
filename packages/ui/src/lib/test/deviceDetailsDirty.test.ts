import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldBlockDeviceDetailsTabLeave } from '../deviceDetailsDirty.ts';

const clean = {
  cameraDirty: false,
  recognitionDirty: false,
  feederDirty: false,
  overviewDirty: false,
};

describe('shouldBlockDeviceDetailsTabLeave', () => {
  it('does not block when the active tab is unchanged', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        ...clean,
        activeTab: 'camera',
        nextTab: 'camera',
        cameraDirty: true,
      }),
      false,
    );
  });

  it('blocks leaving the camera tab only when the camera draft is dirty', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        ...clean,
        activeTab: 'camera',
        nextTab: 'overview',
        cameraDirty: true,
      }),
      true,
    );
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        ...clean,
        activeTab: 'camera',
        nextTab: 'overview',
        recognitionDirty: true,
        feederDirty: true,
        overviewDirty: true,
      }),
      false,
    );
  });

  it('blocks leaving the recognition tab only when the recognition draft is dirty', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        ...clean,
        activeTab: 'recognition',
        nextTab: 'camera',
        recognitionDirty: true,
      }),
      true,
    );
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        ...clean,
        activeTab: 'recognition',
        nextTab: 'camera',
        cameraDirty: true,
        feederDirty: true,
        overviewDirty: true,
      }),
      false,
    );
  });

  it('blocks leaving settings only when the feeder draft is dirty', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        ...clean,
        activeTab: 'settings',
        nextTab: 'history',
        feederDirty: true,
      }),
      true,
    );
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        ...clean,
        activeTab: 'settings',
        nextTab: 'history',
        cameraDirty: true,
        recognitionDirty: true,
        overviewDirty: true,
      }),
      false,
    );
  });

  it('blocks leaving overview only when the overview draft is dirty', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        ...clean,
        activeTab: 'overview',
        nextTab: 'camera',
        overviewDirty: true,
      }),
      true,
    );
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        ...clean,
        activeTab: 'overview',
        nextTab: 'camera',
        cameraDirty: true,
        recognitionDirty: true,
        feederDirty: true,
      }),
      false,
    );
  });

  it('never blocks leaving history', () => {
    assert.equal(
      shouldBlockDeviceDetailsTabLeave({
        ...clean,
        activeTab: 'history',
        nextTab: 'recognition',
        cameraDirty: true,
        recognitionDirty: true,
        feederDirty: true,
        overviewDirty: true,
      }),
      false,
    );
  });
});
