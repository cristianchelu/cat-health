import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CameraIdlePoller } from '../CameraIdlePoller.ts';
import type { PreviewWatcher } from '../loadPreviewWatchers.ts';

function watcher(
  overrides: Partial<PreviewWatcher> &
    Pick<PreviewWatcher, 'deviceId' | 'cameraId'>,
): PreviewWatcher {
  return {
    config: null,
    ...overrides,
  };
}

describe('CameraIdlePoller', () => {
  it('fetches a shared camera at the tightest poll interval', async () => {
    const fetched: number[] = [];
    const remembered: Array<{ cameraId: number; jpeg: Buffer }> = [];
    const poller = new CameraIdlePoller({
      loadWatchers: async () => [
        watcher({
          deviceId: 1,
          cameraId: 9,
          config: { previewIntervalSec: 10 },
        }),
        watcher({
          deviceId: 2,
          cameraId: 9,
          config: { previewIntervalSec: 2 },
        }),
      ],
      fetchSnapshot: async (cameraId) => {
        fetched.push(cameraId);
        return Buffer.from(`cam-${cameraId}`);
      },
      remember: (cameraId, jpeg) => remembered.push({ cameraId, jpeg }),
    });

    await poller.tick(0);
    assert.deepEqual(fetched, [9]);
    assert.equal(remembered.length, 1);

    fetched.length = 0;
    await poller.tick(1999);
    assert.deepEqual(fetched, []);

    await poller.tick(2000);
    assert.deepEqual(fetched, [9]);
  });

  it('does not fetch when every watcher sets previewIntervalSec to 0', async () => {
    const fetched: number[] = [];
    const poller = new CameraIdlePoller({
      loadWatchers: async () => [
        watcher({
          deviceId: 1,
          cameraId: 9,
          config: { previewIntervalSec: 0 },
        }),
        watcher({
          deviceId: 2,
          cameraId: 9,
          config: { previewIntervalSec: 0 },
        }),
      ],
      fetchSnapshot: async (cameraId) => {
        fetched.push(cameraId);
        return Buffer.from('x');
      },
      remember: () => {},
    });

    await poller.tick(0);
    await poller.tick(10_000);
    assert.deepEqual(fetched, []);
  });

  it('treats omitted previewIntervalSec as a 2s poll', async () => {
    const fetched: number[] = [];
    const poller = new CameraIdlePoller({
      loadWatchers: async () => [watcher({ deviceId: 1, cameraId: 4 })],
      fetchSnapshot: async (cameraId) => {
        fetched.push(cameraId);
        return Buffer.from('x');
      },
      remember: () => {},
    });

    await poller.tick(0);
    assert.deepEqual(fetched, [4]);
    fetched.length = 0;
    await poller.tick(1999);
    assert.deepEqual(fetched, []);
    await poller.tick(2000);
    assert.deepEqual(fetched, [4]);
  });

  it('keeps the last frame when a fetch fails', async () => {
    const remembered: Buffer[] = [];
    let shouldFail = false;
    const poller = new CameraIdlePoller({
      loadWatchers: async () => [watcher({ deviceId: 1, cameraId: 4 })],
      fetchSnapshot: async () => {
        if (shouldFail) throw new Error('camera down');
        return Buffer.from('ok');
      },
      remember: (_cameraId, jpeg) => remembered.push(jpeg),
    });

    await poller.tick(0);
    assert.equal(remembered.length, 1);
    shouldFail = true;
    await poller.tick(2000);
    assert.equal(remembered.length, 1);
  });
});
