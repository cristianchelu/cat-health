import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hasIntegratedCameraFlag } from '../loadPreviewWatchers.ts';

describe('hasIntegratedCameraFlag', () => {
  it('is true for JSON boolean true', () => {
    assert.equal(hasIntegratedCameraFlag({ hasCamera: true }), true);
  });

  it('is true for SQLite JSON true stored as 1', () => {
    assert.equal(hasIntegratedCameraFlag({ hasCamera: 1 }), true);
  });

  it('is false when the flag is absent or off', () => {
    assert.equal(hasIntegratedCameraFlag({ host: '10.0.0.1' }), false);
    assert.equal(hasIntegratedCameraFlag({ hasCamera: false }), false);
    assert.equal(hasIntegratedCameraFlag(null), false);
  });
});
