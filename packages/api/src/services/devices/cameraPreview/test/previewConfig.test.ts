import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  coalesceCameraPollIntervals,
  previewPollIntervalMs,
} from '../previewConfig.ts';

describe('previewPollIntervalMs', () => {
  it('is 2000ms when previewIntervalSec is omitted', () => {
    assert.equal(previewPollIntervalMs(undefined), 2000);
    assert.equal(previewPollIntervalMs(null), 2000);
    assert.equal(previewPollIntervalMs({}), 2000);
  });

  it('is null when previewIntervalSec is 0', () => {
    assert.equal(previewPollIntervalMs({ previewIntervalSec: 0 }), null);
  });

  it("uses the watching device's configured interval", () => {
    assert.equal(previewPollIntervalMs({ previewIntervalSec: 10 }), 10000);
  });
});

describe('coalesceCameraPollIntervals', () => {
  it('takes the tightest poll among watchers of one camera', () => {
    const intervals = coalesceCameraPollIntervals([
      { cameraId: 1, pollIntervalMs: 10000 },
      { cameraId: 1, pollIntervalMs: 2000 },
      { cameraId: 2, pollIntervalMs: 4000 },
    ]);
    assert.equal(intervals.get(1), 2000);
    assert.equal(intervals.get(2), 4000);
  });

  it('ignores watchers that do not poll', () => {
    const intervals = coalesceCameraPollIntervals([
      { cameraId: 1, pollIntervalMs: null },
      { cameraId: 1, pollIntervalMs: null },
    ]);
    assert.equal(intervals.size, 0);
  });
});
