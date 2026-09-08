import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CameraPreviewCache } from '../CameraPreviewCache.ts';

describe('CameraPreviewCache', () => {
  it('remembers and peeks the last frame', () => {
    const cache = new CameraPreviewCache();
    const jpeg = Buffer.from('frame-a');
    cache.remember(3, jpeg, 1000);
    assert.deepEqual(cache.peek(3), { jpeg, capturedAt: 1000 });
  });

  it('replaces a previous frame for the same camera', () => {
    const cache = new CameraPreviewCache();
    cache.remember(3, Buffer.from('old'), 1);
    const jpeg = Buffer.from('new');
    cache.remember(3, jpeg, 2);
    assert.equal(cache.peek(3)?.jpeg, jpeg);
    assert.equal(cache.peek(3)?.capturedAt, 2);
  });

  it('forgets a camera', () => {
    const cache = new CameraPreviewCache();
    cache.remember(3, Buffer.from('frame'));
    cache.forget(3);
    assert.equal(cache.peek(3), undefined);
  });
});
